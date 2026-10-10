/**
 * Report queries. Each returns plain, serialisable rows that BOTH the page and its Excel export use,
 * so the export always contains exactly what the screen shows. Cost / value are computed only when the
 * user may see cost (CLAUDE.md: strip it in the query, not the UI). Dates are Riyadh dates.
 */
import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { EntryReason, EntryType } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import { signedQuantity } from "@/lib/stock/lines";
import { OUT_REASONS } from "@/lib/stock/policy";
import type { CurrentUser } from "@/server/auth/dal";
import { entryWhere, parsePage, riyadhDayStart, type EntryFilters } from "./entries";

/** Signed quantity of a line in SQL (VOID takes the opposite sign of the entry it reverses). */
export const SIGNED_QTY = Prisma.sql`l.quantity * CASE
  WHEN e.type IN ('IN', 'TRANSFER_IN', 'CORRECTION_IN') THEN 1
  WHEN e.type IN ('OUT', 'TRANSFER_OUT', 'CORRECTION_OUT') THEN -1
  WHEN v.type IN ('IN', 'TRANSFER_IN', 'CORRECTION_IN') THEN -1
  ELSE 1 END`;

// ─── Stock on hand ─────────────────────────────────────────────────────────

export type StockOnHandRow = {
  productId: string;
  modelCode: string;
  nameEn: string;
  nameAr: string;
  category: string;
  active: boolean;
  qty: Record<string, number>;
  total: number;
  /** ADMIN only — absent (not null) for everyone else. */
  cost?: string | null;
  value?: string | null;
};

export async function stockOnHand(user: CurrentUser, filters: { category?: string }) {
  const showCost = can(user.role, "cost:view");
  const [warehouses, products, levels] = await Promise.all([
    db.warehouse.findMany({
      where: { active: true },
      select: { id: true, name: true, kind: true },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    db.product.findMany({
      where: {
        ...(filters.category ? { category: filters.category } : {}),
        // inactive products only while they still hold stock (Q7 sell-off)
        OR: [{ active: true }, { levels: { some: { quantity: { gt: 0 } } } }],
      },
      select: { id: true, modelCode: true, nameEn: true, nameAr: true, category: true, active: true, cost: showCost },
      orderBy: { modelCode: "asc" },
    }),
    db.stockLevel.findMany({ where: { quantity: { gt: 0 } }, select: { productId: true, warehouseId: true, quantity: true } }),
  ]);

  const byProduct = new Map<string, Record<string, number>>();
  for (const l of levels) (byProduct.get(l.productId) ?? byProduct.set(l.productId, {}).get(l.productId)!)[l.warehouseId] = l.quantity;

  const perWarehouse: Record<string, number> = Object.fromEntries(warehouses.map((w) => [w.id, 0]));
  let totalUnits = 0;
  let totalValue = new Prisma.Decimal(0);
  let missingCost = 0;

  const rows: StockOnHandRow[] = products.map((p) => {
    const qty = byProduct.get(p.id) ?? {};
    const total = warehouses.reduce((s, w) => s + (qty[w.id] ?? 0), 0);
    for (const w of warehouses) perWarehouse[w.id] += qty[w.id] ?? 0;
    totalUnits += total;
    const row: StockOnHandRow = {
      productId: p.id,
      modelCode: p.modelCode,
      nameEn: p.nameEn,
      nameAr: p.nameAr,
      category: p.category,
      active: p.active,
      qty,
      total,
    };
    if (showCost) {
      const cost = (p as { cost?: Prisma.Decimal | null }).cost ?? null;
      row.cost = cost ? cost.toFixed(2) : null;
      // Q14: no cost → no value, left out of the total and counted separately.
      if (cost) {
        const value = cost.mul(total);
        row.value = value.toFixed(2);
        totalValue = totalValue.add(value);
      } else {
        row.value = null;
        if (total > 0) missingCost++;
      }
    }
    return row;
  });

  return {
    warehouses,
    rows,
    totals: {
      perWarehouse,
      units: totalUnits,
      ...(showCost ? { value: totalValue.toFixed(2), missingCost } : {}),
    },
    showCost,
  };
}

// ─── Movement history ──────────────────────────────────────────────────────

export const MOVEMENTS_PAGE_SIZE = 100;
export const EXPORT_MAX_ROWS = 50_000;

export async function movements(filters: EntryFilters, opts: { page?: number; all?: boolean } = {}) {
  const page = parsePage(opts.page);
  const product = filters.product?.trim();
  const where: Prisma.StockEntryLineWhereInput = {
    entry: entryWhere({ ...filters, product: undefined }),
    ...(product ? { product: { modelCode: { contains: product, mode: "insensitive" } } } : {}),
  };
  const [total, lines] = await Promise.all([
    db.stockEntryLine.count({ where }),
    db.stockEntryLine.findMany({
      where,
      orderBy: [{ entry: { entryDate: "desc" } }, { entry: { number: "desc" } }, { product: { modelCode: "asc" } }],
      skip: opts.all ? 0 : (page - 1) * MOVEMENTS_PAGE_SIZE,
      take: opts.all ? EXPORT_MAX_ROWS : MOVEMENTS_PAGE_SIZE,
      select: {
        id: true,
        quantity: true,
        product: { select: { id: true, modelCode: true, nameEn: true, nameAr: true } },
        entry: {
          select: {
            id: true,
            number: true,
            type: true,
            reason: true,
            entryDate: true,
            reference: true,
            customerName: true,
            supplierName: true,
            voidedAt: true,
            warehouse: { select: { name: true } },
            createdBy: { select: { name: true } },
            linkedEntry: { select: { type: true } },
          },
        },
      },
    }),
  ]);
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / MOVEMENTS_PAGE_SIZE)),
    truncated: Boolean(opts.all && total > EXPORT_MAX_ROWS),
    rows: lines.map((l) => ({
      id: l.id,
      entryId: l.entry.id,
      number: l.entry.number,
      date: l.entry.entryDate,
      type: l.entry.type,
      reason: l.entry.reason,
      warehouse: l.entry.warehouse.name,
      productId: l.product.id,
      modelCode: l.product.modelCode,
      nameEn: l.product.nameEn,
      nameAr: l.product.nameAr,
      quantity: signedQuantity(l.quantity, l.entry.type, l.entry.linkedEntry?.type),
      reference: l.entry.reference ?? l.entry.customerName ?? l.entry.supplierName ?? "",
      user: l.entry.createdBy.name,
      voided: Boolean(l.entry.voidedAt),
    })),
  };
}

// ─── Low stock (decision Q5: total across active SELLABLE warehouses, level 0 = never) ─────────────

export async function lowStock(filters: { category?: string }) {
  const [warehouses, products] = await Promise.all([
    db.warehouse.findMany({
      where: { active: true, kind: "SELLABLE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      where: { active: true, lowStockLevel: { gt: 0 }, ...(filters.category ? { category: filters.category } : {}) },
      select: {
        id: true,
        modelCode: true,
        nameEn: true,
        nameAr: true,
        category: true,
        lowStockLevel: true,
        levels: { where: { warehouse: { active: true, kind: "SELLABLE" } }, select: { warehouseId: true, quantity: true } },
      },
      orderBy: { modelCode: "asc" },
    }),
  ]);
  const rows = products
    .map((p) => {
      const qty = Object.fromEntries(p.levels.map((l) => [l.warehouseId, l.quantity]));
      const total = p.levels.reduce((s, l) => s + l.quantity, 0);
      return {
        productId: p.id,
        modelCode: p.modelCode,
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        category: p.category,
        lowStockLevel: p.lowStockLevel,
        qty,
        total,
        shortBy: p.lowStockLevel - total,
      };
    })
    .filter((r) => r.total <= r.lowStockLevel)
    .sort((a, b) => b.shortBy - a.shortBy || a.modelCode.localeCompare(b.modelCode));
  return { warehouses, rows };
}

// ─── Stock out by reason, per month ────────────────────────────────────────

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function monthRange(from?: string, to?: string, now = new Date()) {
  // Riyadh "now" month as YYYY-MM
  const riyadhNow = new Date(now.getTime() + 3 * 3600_000);
  const current = `${riyadhNow.getUTCFullYear()}-${String(riyadhNow.getUTCMonth() + 1).padStart(2, "0")}`;
  const shift = (ym: string, n: number) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const toMonth = to && MONTH.test(to) ? to : current;
  const fromMonth = from && MONTH.test(from) ? from : shift(toMonth, -11);
  return {
    fromMonth,
    toMonth,
    start: riyadhDayStart(`${fromMonth}-01`),
    end: riyadhDayStart(`${shift(toMonth, 1)}-01`),
  };
}

export async function outByReason(filters: { from?: string; to?: string; warehouseId?: string }) {
  const range = monthRange(filters.from, filters.to);
  // Only an active warehouse is a valid filter, so the screen, its select and the export always agree.
  const warehouseId = filters.warehouseId
    ? ((await db.warehouse.findFirst({ where: { id: filters.warehouseId, active: true }, select: { id: true } }))?.id ??
      undefined)
    : undefined;
  const warehouseFilter = warehouseId ? Prisma.sql`AND e."warehouseId" = ${warehouseId}` : Prisma.empty;
  const raw = await db.$queryRaw<{ month: string; reason: EntryReason; units: number }[]>`
    SELECT to_char(date_trunc('month', e."entryDate" AT TIME ZONE 'Asia/Riyadh'), 'YYYY-MM') AS month,
           e.reason,
           SUM(l.quantity)::int AS units
    FROM "StockEntryLine" l
    JOIN "StockEntry" e ON e.id = l."entryId"
    WHERE e.type IN ('OUT', 'TRANSFER_OUT', 'CORRECTION_OUT')
      AND e."voidedAt" IS NULL
      AND e."entryDate" >= ${range.start} AND e."entryDate" < ${range.end}
      ${warehouseFilter}
    GROUP BY 1, 2
    ORDER BY 1 DESC`;

  const reasons = [...OUT_REASONS] as EntryReason[];
  const months = new Map<string, Record<string, number>>();
  for (const r of raw) {
    const row = months.get(r.month) ?? {};
    row[r.reason] = (row[r.reason] ?? 0) + Number(r.units);
    months.set(r.month, row);
  }
  // Q15: a transfer isn't stock leaving the company, so it's left out of the total for "all warehouses".
  const countsInTotal = (reason: string) => Boolean(warehouseId) || reason !== "TRANSFER";
  const rows = [...months.entries()].map(([month, byReason]) => ({
    month,
    byReason,
    total: Object.entries(byReason).reduce((s, [reason, n]) => s + (countsInTotal(reason) ? n : 0), 0),
  }));
  const columnTotals = Object.fromEntries(reasons.map((r) => [r, rows.reduce((s, x) => s + (x.byReason[r] ?? 0), 0)]));
  return {
    ...range,
    reasons,
    rows,
    columnTotals,
    grandTotal: rows.reduce((s, r) => s + r.total, 0),
    warehouseId,
    transfersInTotal: Boolean(warehouseId),
  };
}

export type MovementRow = Awaited<ReturnType<typeof movements>>["rows"][number];
export type { EntryType };
