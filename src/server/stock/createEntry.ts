/**
 * THE single write path for stock (CLAUDE.md "Saving an entry"). Every stock change — forms, opening
 * stock import, transfers, voids — goes through here, in one database transaction:
 *   1. reserve the next number from Counter (UPDATE … LAST_INSERT_ID, same connection)
 *   2. insert the StockEntry and its merged lines
 *   3. update StockLevel per line, sorted by product: IN = upsert, OUT = conditional decrement that
 *      aborts the whole transaction when stock would go below zero.
 *
 * Takes the Prisma client as a parameter so tests can pass the test-database client.
 * Permissions are enforced here as well as in the server actions (defence in depth).
 */
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { EntryReason } from "@/generated/prisma/enums";
import { counterKeyFor, formatEntryNumber, type CounterKey } from "@/lib/stock/numbering";
import { directionOf, mergeLines, type LineInput } from "@/lib/stock/lines";
import { canMove, canReceive } from "@/lib/products";
import { can } from "@/lib/permissions";
import { checkReturnAgainstSale } from "./returns";
import {
  RETURNED_TRASHED,
  conditionWarehouseKind,
  isOrderReason,
  normalizeOrder,
  normalizeReturnReference,
  reasonCodesFor,
  type ReturnCondition,
  type SalesChannel,
} from "@/lib/stock/details";
import { entryPermissionError, entryTypeFor, type Direction, type EntryActor } from "@/lib/stock/policy";
import { ApprovalRequiredError, EntryRuleError, InsufficientStockError } from "./errors";
import { approvalNeeded, approvalRuleFor } from "./approval-rules";

/** The interactive-transaction client Prisma passes to $transaction callbacks. */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type EntryInput = {
  direction: Direction;
  reason: EntryReason;
  /** Where stock moves in or out — the SOURCE for a transfer. */
  warehouseId: string;
  /** Transfers only: where the stock goes. */
  destinationWarehouseId?: string | null;
  /**
   * Customer returns: RESELLABLE → a SELLABLE warehouse; BROKEN or TRASHED → a DAMAGED one. TRASHED is also
   * written off at once (plan channels-returns). Stored on the entry as itemCondition.
   */
  returnCondition?: ReturnCondition | null;
  /** Customer returns: where it was sold; the sale is searched only on that channel. Stored as salesChannel. */
  salesChannel?: SalesChannel | null;
  lines: LineInput[];
  reference?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  technicianName?: string | null;
  supplierName?: string | null;
  /** Supplier master record (Phase B). The caller checks it exists and is active. */
  supplierId?: string | null;
  note?: string | null;
  photoUrl?: string | null;
  /** Phase C1 — return reason / damage category, payment method, salesperson (src/lib/stock/details.ts) */
  reasonCode?: string | null;
  paymentMethod?: string | null;
  salesperson?: string | null;
  /** Return to supplier: expected credit (SAR) */
  expectedCredit?: string | null;
  /** Photos (attachment paths, ownership checked by the caller); photoUrl becomes the first */
  photoUrls?: string[];
  /** Supplier delivery: unit cost per product (SAR). Only for users with cost:enter. */
  lineCosts?: Record<string, string>;
  /** Repeat-submit protection: the same key (from the same user) returns the entry already saved. */
  idempotencyKey?: string | null;
};

/** Set when an approved request is being carried out: the approval rule is then already satisfied. */
export type EntryOptions = { approvedBy?: { id: string } };

/** For a transfer this is the OUT half; `linked` is the IN half. `writeOff`: the write-off of a trashed return. */
export type SavedEntry = { id: string; number: string; linked?: { id: string; number: string }; writeOff?: { id: string; number: string } };

export const MAX_QUANTITY = 100_000;
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

export async function createEntry(client: PrismaClient, actor: EntryActor, input: EntryInput): Promise<SavedEntry> {
  const key = input.idempotencyKey || null;
  if (key) {
    const existing = await savedEntryForKey(client, key, actor);
    if (existing) return existing;
  }
  try {
    return await withRetry(() => client.$transaction((tx) => createEntryInTx(tx, actor, input), TX_OPTIONS));
  } catch (e) {
    // Two submits with the same key at the same moment: the unique index lets one in. Return that one.
    if (key && (e as { code?: string })?.code === "P2002") {
      const existing = await savedEntryForKey(client, key, actor);
      if (existing) return existing;
    }
    throw e;
  }
}

/** The entry already saved under this form key (a transfer returns both halves), only for its own creator. */
async function savedEntryForKey(client: PrismaClient, key: string, actor: EntryActor): Promise<SavedEntry | null> {
  const entry = await client.stockEntry.findUnique({
    where: { idempotencyKey: key },
    select: {
      id: true,
      number: true,
      createdById: true,
      linkedFrom: { where: { type: "TRANSFER_IN" }, select: { id: true, number: true } },
    },
  });
  if (!entry) return null;
  if (entry.createdById !== actor.id) throw new EntryRuleError("stock.errors.duplicateSubmit");
  const linked = entry.linkedFrom[0];
  return linked ? { id: entry.id, number: entry.number, linked } : { id: entry.id, number: entry.number };
}

/**
 * Same as createEntry, inside a transaction the caller already opened. Throws ApprovalRequiredError
 * (before writing anything) when a correction / damaged-lost is above this user's approval limit —
 * use submitEntry (src/server/stock/approvals.ts) to turn that into a request.
 */
export async function createEntryInTx(
  tx: Tx,
  actor: EntryActor,
  input: EntryInput,
  options: EntryOptions = {},
): Promise<SavedEntry> {
  const type = entryTypeFor(input.direction, input.reason);
  if (input.lines.length === 0) throw new EntryRuleError("stock.errors.noLines");
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
      throw new EntryRuleError("stock.errors.invalidQuantity");
    }
  }

  // Customer returns must match a recorded sale and can't exceed it (PC1). Checked first: it locks the sale
  // rows, and a void locks its entry row before the warehouse, so both take the locks in the same order.
  const originalEntryId = input.reason === "CUSTOMER_RETURN" ? await checkReturnAgainstSale(tx, input.reference, mergeLines(input.lines), input.salesChannel) : null;

  const warehouse = await lockActiveWarehouse(tx, input.warehouseId);
  const denied = entryPermissionError(actor, { direction: input.direction, reason: input.reason, warehouse });
  if (denied) throw new EntryRuleError(denied);

  // Customer returns: resellable goods go to a SELLABLE warehouse, broken / trashed ones to a DAMAGED one (Q2).
  const condition = input.reason === "CUSTOMER_RETURN" ? (input.returnCondition ?? "RESELLABLE") : null;
  if (condition && warehouse.kind !== conditionWarehouseKind(condition)) throw new EntryRuleError("stock.errors.returnWarehouseKind");

  let destination: Awaited<ReturnType<typeof lockActiveWarehouse>> | null = null;
  if (type === "TRANSFER_OUT") {
    if (!input.destinationWarehouseId) throw new EntryRuleError("stock.errors.noDestination");
    if (input.destinationWarehouseId === warehouse.id) throw new EntryRuleError("stock.errors.sameWarehouse");
    // Q1: STAFF need only the source assigned; the destination can be any active warehouse.
    destination = await lockActiveWarehouse(tx, input.destinationWarehouseId);
  }

  const lines = mergeLines(input.lines);
  // Share-lock the products: retiring a product (status INACTIVE) takes FOR UPDATE and then checks it
  // holds no stock, so it waits for this save (src/server/actions/products.ts).
  const productIds = [...new Set(lines.map((l) => l.productId))].sort();
  await tx.$queryRaw`SELECT id FROM \`Product\` WHERE id IN (${Prisma.join(productIds)}) LOCK IN SHARE MODE`;
  const products = await tx.product.findMany({
    where: { id: { in: lines.map((l) => l.productId) } },
    select: { id: true, modelCode: true, status: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) throw new EntryRuleError("stock.errors.productNotFound");
    // PB1: inactive (retired) products don't move at all.
    if (!canMove(product.status)) {
      throw new EntryRuleError("stock.errors.productRetired", { modelCode: product.modelCode });
    }
    // Q7: discontinued products can still leave or move (sell-off) but can't be received.
    if (!canReceive(product.status) && input.direction === "IN") {
      throw new EntryRuleError("stock.errors.productInactive", { modelCode: product.modelCode });
    }
  }

  if (!options.approvedBy) {
    const rule = approvalRuleFor(type, input.reason);
    const need = rule ? await approvalNeeded(tx, actor, rule, lines) : null;
    if (need) throw new ApprovalRequiredError({ ...need, warehouseId: warehouse.id });
  }

  // Unit costs: only on supplier deliveries, only by users who may enter costs (ADMIN / MANAGER).
  const lineCosts = Object.entries(input.lineCosts ?? {}).filter(([, c]) => c !== "" && c != null);
  if (lineCosts.length) {
    if (input.reason !== "SUPPLIER_DELIVERY") throw new EntryRuleError("errors.invalidInput");
    if (!can(actor.role, "cost:enter")) throw new EntryRuleError("errors.forbidden");
  }


  // Checked here too (not only in the form action), so an approved request can't use a supplier that was
  // deactivated while it waited.
  if (input.supplierId && !(await tx.supplier.count({ where: { id: input.supplierId, active: true } }))) {
    throw new EntryRuleError("products.errors.unknownSupplier");
  }

  // Codes only where the reason has a list, and only from that list (the form checks too; this guards replays).
  const code = clean(input.reasonCode);
  if (code && !reasonCodesFor(input.reason).includes(code)) throw new EntryRuleError("errors.invalidInput");
  const prefix = counterKeyFor(type);
  const value = await nextCounterValue(tx, prefix);
  const fields = {
    reason: input.reason,
    // Channel order numbers are stored normalised ("#12 345" → "12345", "nae 123" → "NAE123"), and a return
    // by order no. is stored like the sale's, so later returns find it.
    reference: storedReference(input.reason, input.reference, input.salesChannel),
    customerName: clean(input.customerName),
    customerPhone: clean(input.customerPhone),
    technicianName: clean(input.technicianName),
    supplierName: clean(input.supplierName),
    supplierId: input.supplierId || null,
    note: clean(input.note),
    photoUrl: clean(input.photoUrls?.[0] ?? input.photoUrl),
    reasonCode: clean(input.reasonCode),
    paymentMethod: clean(input.paymentMethod),
    salesperson: clean(input.salesperson),
    createdById: actor.id,
  };

  const entry = await tx.stockEntry.create({
    data: {
      ...fields,
      idempotencyKey: input.idempotencyKey || null, // only on this entry (the OUT half of a transfer)
      number: formatEntryNumber(prefix, value, type),
      type,
      warehouseId: warehouse.id,
      originalEntryId,
      itemCondition: condition,
      salesChannel: input.reason === "CUSTOMER_RETURN" ? (input.salesChannel ?? null) : null,
      lines: { create: lines },
    },
    select: { id: true, number: true, lines: { select: { id: true, productId: true } } },
  });
  await saveEntryExtras(tx, actor, entry, input, lineCosts);
  const changes: LevelChange[] = lines.map((l) => ({
    productId: l.productId,
    warehouseId: warehouse.id,
    delta: directionOf(type) * l.quantity,
  }));

  let linked: SavedEntry["linked"];
  if (destination) {
    // The IN half shares the counter value and links back to the OUT half (one-way link, decision T2).
    linked = await tx.stockEntry.create({
      data: {
        ...fields,
        number: formatEntryNumber(prefix, value, "TRANSFER_IN"),
        type: "TRANSFER_IN",
        warehouseId: destination.id,
        linkedEntryId: entry.id,
        lines: { create: lines },
      },
      select: { id: true, number: true },
    });
    for (const l of lines) changes.push({ productId: l.productId, warehouseId: destination.id, delta: l.quantity });
  }

  // A trashed return is written off straight away: a damaged/lost OUT of the same goods from the same
  // warehouse, pointing at the return. Part of the return itself, so no approval of its own; voiding
  // either one voids both (voidEntry.ts).
  let writeOff: SavedEntry["writeOff"];
  if (condition === "TRASHED") {
    writeOff = await tx.stockEntry.create({
      data: {
        ...fields,
        reason: "DAMAGED_LOST",
        reasonCode: RETURNED_TRASHED,
        photoUrl: null, // the photos belong to the return
        number: formatEntryNumber("OUT", await nextCounterValue(tx, "OUT"), "OUT"),
        type: "OUT",
        warehouseId: warehouse.id,
        originalEntryId: entry.id,
        lines: { create: lines },
      },
      select: { id: true, number: true },
    });
    for (const l of lines) changes.push({ productId: l.productId, warehouseId: warehouse.id, delta: -l.quantity });
  }

  await applyLevelChanges(tx, changes);
  const saved = { id: entry.id, number: entry.number };
  return { ...saved, ...(linked ? { linked } : {}), ...(writeOff ? { writeOff } : {}) };
}

/** How a reference is stored: channel orders normalised; a customer return like the sale it points at. */
function storedReference(reason: EntryReason, reference: string | null | undefined, channel?: SalesChannel | null): string | null {
  if (isOrderReason(reason)) return normalizeOrder(reason, reference) ?? clean(reference);
  if (reason === "CUSTOMER_RETURN") return normalizeReturnReference(channel, reference) ?? clean(reference);
  return clean(reference);
}

/** Photos, delivery line costs (+ the product's cost history) and the return-to-supplier follow-up. */
async function saveEntryExtras(
  tx: Tx,
  actor: EntryActor,
  entry: { id: string; lines: { id: string; productId: string }[] },
  input: EntryInput,
  lineCosts: [string, string][],
) {
  const photos = [...new Set(input.photoUrls ?? (input.photoUrl ? [input.photoUrl] : []))];
  if (photos.length) {
    // Each photo belongs to one entry (unique attachmentId); checked again here for requests approved later.
    const ids = photos.map((url) => url.split("/").pop()!);
    if (await tx.entryAttachment.count({ where: { attachmentId: { in: ids } } })) throw new EntryRuleError("photo.errors.used");
    await tx.entryAttachment.createMany({
      data: photos.map((url, position) => ({ entryId: entry.id, attachmentId: url.split("/").pop()!, position })),
    });
  }
  for (const [productId, unitCost] of lineCosts) {
    const line = entry.lines.find((l) => l.productId === productId);
    if (!line) throw new EntryRuleError("errors.invalidInput");
    await tx.lineCost.create({ data: { lineId: line.id, unitCost, enteredById: actor.id } });
    await tx.productCost.create({ data: { productId, cost: unitCost, source: "DELIVERY", changedById: actor.id } });
  }
  if (input.reason === "SUPPLIER_RETURN") {
    await tx.supplierReturn.create({ data: { entryId: entry.id, expectedCredit: clean(input.expectedCredit), status: "SENT", updatedById: actor.id } });
  }
}

/**
 * Share-lock an active warehouse for the rest of the transaction. Deactivating a warehouse or changing
 * its kind takes FOR UPDATE, so it waits for (and then sees) every save in progress.
 * (`LOCK IN SHARE MODE` is MariaDB's spelling of FOR SHARE.)
 */
export async function lockActiveWarehouse(tx: Tx, warehouseId: string) {
  await tx.$queryRaw`SELECT id FROM \`Warehouse\` WHERE id = ${warehouseId} LOCK IN SHARE MODE`;
  const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
  if (!warehouse || !warehouse.active) throw new EntryRuleError("stock.errors.warehouseInactive");
  return warehouse;
}

/**
 * Atomically take the next value of a counter. MariaDB has no UPDATE … RETURNING, so the new value is
 * stored with LAST_INSERT_ID(expr) and read back on the SAME connection (the transaction's).
 * Rows are created at start-up (src/server/db/base-data.ts) and by the test reset.
 */
export async function nextCounterValue(tx: Tx, key: CounterKey): Promise<number> {
  const updated = await tx.$executeRaw`
    UPDATE \`Counter\` SET value = LAST_INSERT_ID(value + 1) WHERE \`key\` = ${key}`;
  if (updated !== 1) throw new Error(`Counter "${key}" is missing — restart the app (it creates counters) or run pnpm db:seed`);
  const rows = await tx.$queryRaw<{ value: bigint | number }[]>`SELECT LAST_INSERT_ID() AS value`;
  return Number(rows[0].value);
}

export type LevelChange = { productId: string; warehouseId: string; delta: number };

/**
 * Apply stock changes in a fixed order (product, then warehouse) so concurrent transactions lock
 * StockLevel rows in the same order. Changes to the same product + warehouse are added up first (a trashed
 * return and its write-off cancel out). Decrements are conditional: if any would go negative, throw
 * InsufficientStockError and the caller's transaction rolls back completely.
 */
export async function applyLevelChanges(tx: Tx, changes: LevelChange[]): Promise<void> {
  const net = new Map<string, LevelChange>();
  for (const c of changes) {
    const key = `${c.productId}|${c.warehouseId}`;
    const prev = net.get(key);
    net.set(key, prev ? { ...prev, delta: prev.delta + c.delta } : { ...c });
  }
  const sorted = [...net.values()]
    .filter((c) => c.delta !== 0)
    .sort((a, b) =>
      a.productId === b.productId
        ? a.warehouseId.localeCompare(b.warehouseId)
        : a.productId.localeCompare(b.productId),
    );

  for (const { productId, warehouseId, delta } of sorted) {
    if (delta > 0) {
      await tx.$executeRaw`
        INSERT INTO \`StockLevel\` (\`productId\`, \`warehouseId\`, quantity)
        VALUES (${productId}, ${warehouseId}, ${delta})
        ON DUPLICATE KEY UPDATE quantity = quantity + ${delta}`;
      continue;
    }
    const take = -delta;
    const updated = await tx.$executeRaw`
      UPDATE \`StockLevel\` SET quantity = quantity - ${take}
      WHERE \`productId\` = ${productId} AND \`warehouseId\` = ${warehouseId} AND quantity >= ${take}`;
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

/** Retry a whole transaction on deadlock / lock wait timeout (MariaDB 1213 / 1205, Prisma P2034). */
export async function withRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
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
  return err?.code === "P2034" || /deadlock found|lock wait timeout|\b1213\b|\b1205\b|40001/i.test(err?.message ?? "");
}
