/**
 * THE single write path for stock (CLAUDE.md "Saving an entry"). Every stock change — forms, opening
 * stock import, transfers, voids — goes through here, in one database transaction:
 *   1. reserve the next number from Counter (UPDATE … RETURNING)
 *   2. insert the StockEntry and its merged lines
 *   3. update StockLevel per line, sorted by product: IN = upsert, OUT = conditional decrement that
 *      aborts the whole transaction when stock would go below zero.
 *
 * Takes the Prisma client as a parameter so tests can pass the test-database client.
 * Permissions are enforced here as well as in the server actions (defence in depth).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { EntryReason } from "@/generated/prisma/enums";
import { counterKeyFor, formatEntryNumber, type CounterKey } from "@/lib/stock/numbering";
import { directionOf, mergeLines, type LineInput } from "@/lib/stock/lines";
import { entryPermissionError, entryTypeFor, type Direction, type EntryActor } from "@/lib/stock/policy";
import { EntryRuleError, InsufficientStockError } from "./errors";

/** The interactive-transaction client Prisma passes to $transaction callbacks. */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type EntryInput = {
  direction: Direction;
  reason: EntryReason;
  warehouseId: string;
  lines: LineInput[];
  reference?: string | null;
  customerName?: string | null;
  technicianName?: string | null;
  supplierName?: string | null;
  note?: string | null;
  photoUrl?: string | null;
};

export type SavedEntry = { id: string; number: string };

export const MAX_QUANTITY = 100_000;
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

export async function createEntry(client: PrismaClient, actor: EntryActor, input: EntryInput): Promise<SavedEntry> {
  return withRetry(() => client.$transaction((tx) => createEntryInTx(tx, actor, input), TX_OPTIONS));
}

/** Same as createEntry, inside a transaction the caller already opened (used to compose transfers / voids). */
export async function createEntryInTx(tx: Tx, actor: EntryActor, input: EntryInput): Promise<SavedEntry> {
  const type = entryTypeFor(input.direction, input.reason);
  if (type === "TRANSFER_OUT") {
    throw new EntryRuleError("stock.errors.invalidReason"); // transfers are saved by createTransfer
  }
  if (input.lines.length === 0) throw new EntryRuleError("stock.errors.noLines");
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
      throw new EntryRuleError("stock.errors.invalidQuantity");
    }
  }

  // Share lock: warehouse deactivation / kind change (which take FOR UPDATE) wait for this save.
  await tx.$queryRaw`SELECT id FROM "Warehouse" WHERE id = ${input.warehouseId} FOR SHARE`;
  const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
  if (!warehouse || !warehouse.active) throw new EntryRuleError("stock.errors.warehouseInactive");

  const denied = entryPermissionError(actor, { direction: input.direction, reason: input.reason, warehouse });
  if (denied) throw new EntryRuleError(denied);

  const lines = mergeLines(input.lines);
  const products = await tx.product.findMany({
    where: { id: { in: lines.map((l) => l.productId) } },
    select: { id: true, modelCode: true, active: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) throw new EntryRuleError("stock.errors.productNotFound");
    // Q7: discontinued products can still leave (sell-off) but can't come in.
    if (!product.active && input.direction === "IN") {
      throw new EntryRuleError("stock.errors.productInactive", { modelCode: product.modelCode });
    }
  }

  const number = formatEntryNumber(counterKeyFor(type), await nextCounterValue(tx, counterKeyFor(type)), type);
  const entry = await tx.stockEntry.create({
    data: {
      number,
      type,
      reason: input.reason,
      warehouseId: warehouse.id,
      reference: clean(input.reference),
      customerName: clean(input.customerName),
      technicianName: clean(input.technicianName),
      supplierName: clean(input.supplierName),
      note: clean(input.note),
      photoUrl: clean(input.photoUrl),
      createdById: actor.id,
      lines: { create: lines },
    },
    select: { id: true, number: true },
  });

  const sign = directionOf(type);
  await applyLevelChanges(
    tx,
    lines.map((l) => ({ productId: l.productId, warehouseId: warehouse.id, delta: sign * l.quantity })),
  );
  return entry;
}

/** Atomically take the next value of a counter. Rows are created by the seed (and the test reset). */
export async function nextCounterValue(tx: Tx, key: CounterKey): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    UPDATE "Counter" SET value = value + 1 WHERE key = ${key} RETURNING value`;
  if (rows.length !== 1) throw new Error(`Counter "${key}" is missing — run pnpm db:seed`);
  return Number(rows[0].value);
}

export type LevelChange = { productId: string; warehouseId: string; delta: number };

/**
 * Apply stock changes in a fixed order (product, then warehouse) so concurrent transactions lock
 * StockLevel rows in the same order. Decrements are conditional: if any would go negative, throw
 * InsufficientStockError and the caller's transaction rolls back completely.
 */
export async function applyLevelChanges(tx: Tx, changes: LevelChange[]): Promise<void> {
  const sorted = [...changes]
    .filter((c) => c.delta !== 0)
    .sort((a, b) =>
      a.productId === b.productId
        ? a.warehouseId.localeCompare(b.warehouseId)
        : a.productId.localeCompare(b.productId),
    );

  for (const { productId, warehouseId, delta } of sorted) {
    if (delta > 0) {
      await tx.$executeRaw`
        INSERT INTO "StockLevel" ("productId", "warehouseId", quantity)
        VALUES (${productId}, ${warehouseId}, ${delta})
        ON CONFLICT ("productId", "warehouseId")
        DO UPDATE SET quantity = "StockLevel".quantity + EXCLUDED.quantity`;
      continue;
    }
    const take = -delta;
    const updated = await tx.$executeRaw`
      UPDATE "StockLevel" SET quantity = quantity - ${take}
      WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId} AND quantity >= ${take}`;
    if (updated === 0) {
      const [level, product, warehouse] = await Promise.all([
        tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } }),
        tx.product.findUnique({ where: { id: productId }, select: { modelCode: true } }),
        tx.warehouse.findUnique({ where: { id: warehouseId }, select: { name: true } }),
      ]);
      throw new InsufficientStockError({
        productId,
        modelCode: product?.modelCode ?? productId,
        warehouseName: warehouse?.name ?? warehouseId,
        available: level?.quantity ?? 0,
        requested: take,
      });
    }
  }
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/** Retry a whole transaction on deadlock / write conflict (Postgres 40P01 / 40001, Prisma P2034). */
async function withRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await run();
    } catch (e) {
      if (i >= attempts || !isRetryable(e)) throw e;
      await new Promise((r) => setTimeout(r, 20 * i + Math.random() * 30));
    }
  }
}

function isRetryable(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === "P2034" || /deadlock detected|could not serialize|40P01|40001/i.test(err?.message ?? "");
}
