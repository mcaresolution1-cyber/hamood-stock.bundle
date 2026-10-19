/**
 * Stock movement over time — the dashboard chart and the inventory report (plan ux-dashboard-report).
 * Rules (PX1–PX3):
 * - Every StockEntry is approved (pending requests are not entries). Voided entries and their VOID
 *   reversals are left out everywhere, so opening + in − out = closing always holds.
 * - In = IN, CORRECTION_IN, TRANSFER_IN; out = OUT, CORRECTION_OUT, TRANSFER_OUT. Transfers only count when
 *   one warehouse is chosen (across all warehouses they are not real in/out).
 * - Days are Riyadh days (UTC+3, `INTERVAL 3 HOUR`), empty days are returned as zero.
 * All sums are done in MariaDB.
 */
import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { z } from "zod";
import { addDays, daysBetween, riyadhDay, riyadhStart } from "@/lib/stock/days";

export type MovementScope = {
  /** Riyadh days, both included */
  from: string;
  to: string;
  warehouseId?: string;
  categoryId?: string;
  /** Opening-stock entries (the dashboard leaves them out by default: they dwarf everything else). */
  includeOpening: boolean;
};

const IN_TYPES = Prisma.sql`('IN', 'CORRECTION_IN', 'TRANSFER_IN')`;
const OUT_TYPES = Prisma.sql`('OUT', 'CORRECTION_OUT', 'TRANSFER_OUT')`;

/** Conditions every movement query shares (entries `e`, lines `l`). Range limits are added by the caller. */
function scopeSql(s: Omit<MovementScope, "from" | "to">) {
  const parts = [Prisma.sql`e.voidedAt IS NULL`, Prisma.sql`e.type <> 'VOID'`];
  if (s.warehouseId) parts.push(Prisma.sql`e.warehouseId = ${s.warehouseId}`);
  else parts.push(Prisma.sql`e.type NOT IN ('TRANSFER_IN', 'TRANSFER_OUT')`);
  if (!s.includeOpening) parts.push(Prisma.sql`e.reason <> 'OPENING_STOCK'`);
  if (s.categoryId) parts.push(Prisma.sql`l.productId IN (SELECT pc.productId FROM \`ProductCategory\` pc WHERE pc.categoryId = ${s.categoryId})`);
  return Prisma.join(parts, " AND ");
}

export type DayMovement = { day: string; in: number; out: number };

/** Units in and out per Riyadh day, every day of the range present. */
export async function movementByDay(s: MovementScope): Promise<DayMovement[]> {
  const rows = await db.$queryRaw<{ day: string; qin: unknown; qout: unknown }[]>`
    SELECT DATE_FORMAT(e.entryDate + INTERVAL 3 HOUR, '%Y-%m-%d') AS day,
      SUM(CASE WHEN e.type IN ${IN_TYPES} THEN l.quantity ELSE 0 END) AS qin,
      SUM(CASE WHEN e.type IN ${OUT_TYPES} THEN l.quantity ELSE 0 END) AS qout
    FROM \`StockEntryLine\` l
    JOIN \`StockEntry\` e ON e.id = l.entryId
    WHERE e.entryDate >= ${riyadhStart(s.from)} AND e.entryDate < ${riyadhStart(addDays(s.to, 1))} AND ${scopeSql(s)}
    GROUP BY day`;
  const byDay = new Map(rows.map((r) => [r.day, { in: Number(r.qin ?? 0), out: Number(r.qout ?? 0) }]));
  return daysBetween(s.from, s.to).map((day) => ({ day, in: byDay.get(day)?.in ?? 0, out: byDay.get(day)?.out ?? 0 }));
}

export type ProductMovement = {
  productId: string;
  modelCode: string;
  sku: string;
  nameEn: string;
  nameAr: string;
  opening: number;
  in: number;
  out: number;
  closing: number;
};

/**
 * Per product: balance before the range, in and out during it, balance at its end. Opening/closing come
 * from the movements (not today's stock), so past ranges are right. Across all warehouses transfers are left
 * out of opening, in and out alike (they net to zero — and the two halves may fall on either side of midnight).
 */
export async function movementByProduct(s: MovementScope, opts: { showAll?: boolean } = {}): Promise<ProductMovement[]> {
  const start = riyadhStart(s.from);
  const end = riyadhStart(addDays(s.to, 1));
  const signed = Prisma.sql`CASE WHEN e.type IN ${IN_TYPES} THEN l.quantity WHEN e.type IN ${OUT_TYPES} THEN -l.quantity ELSE 0 END`;
  const moved = Prisma.sql`e.entryDate >= ${start} AND (${s.warehouseId ? Prisma.sql`1 = 1` : Prisma.sql`e.type NOT IN ('TRANSFER_IN', 'TRANSFER_OUT')`})`;
  const rows = await db.$queryRaw<{ productId: string; opening: unknown; qin: unknown; qout: unknown }[]>`
    SELECT l.productId,
      SUM(CASE WHEN e.entryDate < ${start} THEN ${signed} ELSE 0 END) AS opening,
      SUM(CASE WHEN ${moved} AND e.type IN ${IN_TYPES} THEN l.quantity ELSE 0 END) AS qin,
      SUM(CASE WHEN ${moved} AND e.type IN ${OUT_TYPES} THEN l.quantity ELSE 0 END) AS qout
    FROM \`StockEntryLine\` l
    JOIN \`StockEntry\` e ON e.id = l.entryId
    WHERE e.entryDate < ${end} AND ${scopeSql({ ...s, includeOpening: true })}
    GROUP BY l.productId`;
  const sums = new Map(rows.map((r) => [r.productId, { opening: Number(r.opening ?? 0), in: Number(r.qin ?? 0), out: Number(r.qout ?? 0) }]));

  const products = await db.product.findMany({
    where: {
      ...(opts.showAll ? {} : { id: { in: [...sums.keys()] } }),
      ...(s.categoryId ? { categories: { some: { categoryId: s.categoryId } } } : {}),
    },
    select: { id: true, modelCode: true, sku: true, nameEn: true, nameAr: true },
    orderBy: { modelCode: "asc" },
  });
  return products
    .map((p) => {
      const m = sums.get(p.id) ?? { opening: 0, in: 0, out: 0 };
      return { productId: p.id, modelCode: p.modelCode, sku: p.sku, nameEn: p.nameEn, nameAr: p.nameAr, ...m, closing: m.opening + m.in - m.out };
    })
    .filter((p) => opts.showAll || p.opening !== 0 || p.in !== 0 || p.out !== 0);
}

/** Every entry line in the range (newest last), signed: + in, − out. Capped (a printout of more helps nobody). */
export const MOVEMENT_LIST_LIMIT = 5000;
export async function movementLines(s: MovementScope) {
  const rows = await db.$queryRaw<
    {
      entryDate: Date;
      number: string;
      type: string;
      reason: string;
      warehouse: string;
      modelCode: string;
      quantity: number;
      reference: string | null;
      user: string;
    }[]
  >`
    SELECT e.entryDate, e.number, e.type, e.reason, w.name AS warehouse, p.modelCode,
      CASE WHEN e.type IN ${OUT_TYPES} THEN -l.quantity ELSE l.quantity END AS quantity,
      e.reference, u.name AS user
    FROM \`StockEntryLine\` l
    JOIN \`StockEntry\` e ON e.id = l.entryId
    JOIN \`Warehouse\` w ON w.id = e.warehouseId
    JOIN \`Product\` p ON p.id = l.productId
    JOIN \`User\` u ON u.id = e.createdById
    WHERE e.entryDate >= ${riyadhStart(s.from)} AND e.entryDate < ${riyadhStart(addDays(s.to, 1))} AND ${scopeSql(s)}
    ORDER BY e.entryDate, e.number, p.modelCode
    LIMIT ${MOVEMENT_LIST_LIMIT + 1}`;
  return { rows: rows.slice(0, MOVEMENT_LIST_LIMIT).map((r) => ({ ...r, quantity: Number(r.quantity) })), truncated: rows.length > MOVEMENT_LIST_LIMIT };
}

/** How many entries the range holds (same rules). */
export async function entryCount(s: MovementScope): Promise<number> {
  const [row] = await db.$queryRaw<{ n: unknown }[]>`
    SELECT COUNT(DISTINCT e.id) AS n
    FROM \`StockEntryLine\` l
    JOIN \`StockEntry\` e ON e.id = l.entryId
    WHERE e.entryDate >= ${riyadhStart(s.from)} AND e.entryDate < ${riyadhStart(addDays(s.to, 1))} AND ${scopeSql(s)}`;
  return Number(row?.n ?? 0);
}

const chartSchema = z.object({
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  warehouseId: z.string().max(64).default(""),
  includeOpening: z.boolean().default(false),
});

/**
 * The dashboard chart: units in / out per Riyadh day for the last N days, today included. Callers check
 * access (the dashboard page, the loadStockMovement action).
 */
export async function stockMovement(input: unknown): Promise<DayMovement[]> {
  const { days, warehouseId, includeOpening } = chartSchema.parse(input);
  const to = riyadhDay(new Date());
  return movementByDay({ from: addDays(to, -(days - 1)), to, warehouseId: warehouseId || undefined, includeOpening });
}

/**
 * Everything the inventory report shows (page and Excel use the same object). Opening stock entries count
 * as "in" here: they are stock that arrived in the range (PX2).
 */
export async function inventoryReport(p: { from: string; to: string; warehouseId?: string; categoryId?: string; showAll: boolean }) {
  // An unknown warehouse / category id (an old link) means "all", never an empty report that looks real.
  const [warehouse, category] = await Promise.all([
    p.warehouseId ? db.warehouse.findUnique({ where: { id: p.warehouseId }, select: { id: true, name: true } }) : null,
    p.categoryId ? db.category.findUnique({ where: { id: p.categoryId }, select: { id: true, nameEn: true, nameAr: true } }) : null,
  ]);
  const scope: MovementScope = { from: p.from, to: p.to, warehouseId: warehouse?.id, categoryId: category?.id, includeOpening: true };
  const [days, products, lines, entries] = await Promise.all([
    movementByDay(scope),
    movementByProduct(scope, { showAll: p.showAll }),
    movementLines(scope),
    entryCount(scope),
  ]);
  const sum = (k: "opening" | "in" | "out" | "closing") => products.reduce((s, x) => s + x[k], 0);
  // With "show all" off, products without stock or movement are left out — they add 0 to every total.
  const summary = { opening: sum("opening"), in: sum("in"), out: sum("out"), closing: sum("closing"), entries };
  return { warehouse, category, days, products, lines, summary };
}
export type InventoryReport = Awaited<ReturnType<typeof inventoryReport>>;

/** Choices for the Generate report dialog and the chart's warehouse filter. */
export async function reportChoices() {
  const [warehouses, categories] = await Promise.all([
    db.warehouse.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.category.findMany({ where: { active: true }, select: { id: true, nameEn: true, nameAr: true }, orderBy: [{ position: "asc" }, { nameEn: "asc" }] }),
  ]);
  return { warehouses, categories, today: riyadhDay(new Date()) };
}
