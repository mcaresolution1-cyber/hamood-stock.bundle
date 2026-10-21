/** Entry list + detail reads. No cost anywhere. Dates are interpreted in Asia/Riyadh. */
import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { EntryReason, EntryType } from "@/generated/prisma/enums";

export const ENTRY_PAGE_SIZE = 50;
export const ENTRY_TYPES: EntryType[] = ["IN", "OUT", "TRANSFER_OUT", "TRANSFER_IN", "CORRECTION_IN", "CORRECTION_OUT", "VOID"];
export const ENTRY_REASONS: EntryReason[] = [
  "SUPPLIER_DELIVERY",
  "CUSTOMER_RETURN",
  "OPENING_STOCK",
  "WEBSITE_ORDER",
  "NOON_ORDER",
  "AMAZON_ORDER",
  "DIRECT_SALE",
  "INSTALLATION",
  "TRANSFER",
  "SUPPLIER_RETURN",
  "DAMAGED_LOST",
  "CORRECTION",
  "VOID",
];

export type EntryFilters = {
  from?: string; // YYYY-MM-DD, Riyadh day
  to?: string; // YYYY-MM-DD inclusive
  warehouseId?: string;
  type?: EntryType;
  reason?: EntryReason;
  userId?: string;
  product?: string; // model code (contains)
  /** Supplier deliveries with a line still missing its unit cost (Phase C1) */
  costPending?: "1";
  page?: number;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar day in YYYY-MM-DD form (rejects 2026-13-01 and 2026-02-30). */
export function isValidDay(day: string | undefined): day is string {
  if (!day || !DAY.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/** Page number from a URL value: a positive integer, capped so skip stays a safe Int. */
export function parsePage(v: unknown): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1;
}

/** Start of a Riyadh calendar day (UTC+3, no daylight saving) as a UTC instant. */
export function riyadhDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}

/** A non-voided supplier delivery with at least one line without a unit cost. */
export const COST_PENDING: Prisma.StockEntryWhereInput = {
  reason: "SUPPLIER_DELIVERY",
  voidedAt: null,
  lines: { some: { cost: { is: null } } },
};

export function entryWhere(f: EntryFilters): Prisma.StockEntryWhereInput {
  const entryDate: Prisma.DateTimeFilter = {};
  if (isValidDay(f.from)) entryDate.gte = riyadhDayStart(f.from);
  if (isValidDay(f.to)) entryDate.lt = new Date(riyadhDayStart(f.to).getTime() + 86_400_000);
  const product = f.product?.trim();
  return {
    ...(entryDate.gte || entryDate.lt ? { entryDate } : {}),
    ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.reason ? { reason: f.reason } : {}),
    ...(f.userId ? { createdById: f.userId } : {}),
    ...(product ? { lines: { some: { product: { modelCode: { contains: product } } } } } : {}),
    ...(f.costPending ? COST_PENDING : {}),
  };
}

export async function listEntries(f: EntryFilters) {
  const page = parsePage(f.page);
  const where = entryWhere(f);
  const [total, rows] = await Promise.all([
    db.stockEntry.count({ where }),
    db.stockEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { number: "desc" }],
      skip: (page - 1) * ENTRY_PAGE_SIZE,
      take: ENTRY_PAGE_SIZE,
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
        // Only whether a cost exists (never the amount), for the "cost pending" badge.
        lines: { select: { quantity: true, cost: { select: { lineId: true } } } },
      },
    }),
  ]);
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / ENTRY_PAGE_SIZE)),
    rows: rows.map(({ lines, ...e }) => ({
      ...e,
      units: lines.reduce((s, l) => s + l.quantity, 0),
      lineCount: lines.length,
      costPending: e.reason === "SUPPLIER_DELIVERY" && !e.voidedAt && lines.some((l) => !l.cost),
    })),
  };
}

export async function entryFilterOptions() {
  const [warehouses, users] = await Promise.all([
    db.warehouse.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { warehouses, users };
}

export async function getEntry(id: string) {
  const entry = await readEntry(id);
  if (!entry) return null;
  const pick = (reason: "CUSTOMER_RETURN" | "DAMAGED_LOST") => entry.returns.filter((r) => r.reason === reason).map(({ id, number }) => ({ id, number }));
  return { ...entry, returns: pick("CUSTOMER_RETURN"), writeOffs: pick("DAMAGED_LOST") };
}

function readEntry(id: string) {
  return db.stockEntry.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      type: true,
      reason: true,
      entryDate: true,
      createdAt: true,
      reference: true,
      customerName: true,
      customerPhone: true,
      technicianName: true,
      supplierName: true,
      note: true,
      photoUrl: true,
      reasonCode: true,
      itemCondition: true,
      salesChannel: true,
      paymentMethod: true,
      salesperson: true,
      voidedAt: true,
      originalEntry: { select: { id: true, number: true } },
      // Returns of a sale (not voided), and a trashed return's automatic write-off (plan channels-returns).
      returns: {
        where: { OR: [{ reason: "CUSTOMER_RETURN", voidedAt: null }, { reason: "DAMAGED_LOST" }] },
        select: { id: true, number: true, reason: true },
        orderBy: { createdAt: "asc" },
      },
      attachments: { select: { attachmentId: true }, orderBy: { position: "asc" } },
      warehouse: { select: { id: true, name: true, city: true, kind: true } },
      createdBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
      linkedEntry: { select: { id: true, number: true, type: true, warehouse: { select: { id: true, name: true } } } },
      approvedVia: { select: { id: true, number: true, decidedBy: { select: { name: true } } } },
      voidRequests: { where: { status: "PENDING" }, select: { id: true, number: true } },
      linkedFrom: {
        select: { id: true, number: true, type: true, note: true, warehouse: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      lines: {
        select: {
          id: true,
          quantity: true,
          product: { select: { id: true, modelCode: true, nameEn: true, nameAr: true, variant: true, imageUrl: true } },
        },
        orderBy: { product: { modelCode: "asc" } },
      },
    },
  });
}

export type EntryDetail = NonNullable<Awaited<ReturnType<typeof getEntry>>>;

/** Related entries, named for the screen. Partners are found by type (VOIDs also link, decision T2). */
export function relatedEntries(e: EntryDetail) {
  return {
    voidEntry: e.linkedFrom.find((x) => x.type === "VOID") ?? null,
    transferIn: e.type === "TRANSFER_OUT" ? (e.linkedFrom.find((x) => x.type === "TRANSFER_IN") ?? null) : null,
    transferOut: e.type === "TRANSFER_IN" ? e.linkedEntry : null,
    reverses: e.type === "VOID" ? e.linkedEntry : null,
  };
}

/** Read entry/movement filters from URL search params, ignoring anything invalid. */
export function parseEntryFilters(sp: Record<string, string | string[] | undefined>): EntryFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  return {
    from: isValidDay(one("from")) ? one("from") : undefined,
    to: isValidDay(one("to")) ? one("to") : undefined,
    warehouseId: one("warehouseId") || undefined,
    type: (ENTRY_TYPES as string[]).includes(one("type")) ? (one("type") as EntryType) : undefined,
    reason: (ENTRY_REASONS as string[]).includes(one("reason")) ? (one("reason") as EntryReason) : undefined,
    userId: one("userId") || undefined,
    product: one("product").slice(0, 50) || undefined,
    costPending: one("costPending") === "1" ? "1" : undefined,
    page: parsePage(one("page")),
  };
}

/**
 * Money on one entry — delivery line costs and the return-to-supplier credit. Only call it for users who may
 * see it: cost:view (ADMIN, ACCOUNTANT) or cost:enter in the entry's warehouse (MANAGER).
 */
export async function getEntryMoney(id: string) {
  const entry = await db.stockEntry.findUnique({
    where: { id },
    select: {
      lines: { select: { id: true, productId: true, cost: { select: { unitCost: true, enteredAt: true, enteredBy: { select: { name: true } } } } } },
      supplierReturn: { select: { expectedCredit: true, status: true, creditAmount: true, creditReceivedAt: true } },
    },
  });
  if (!entry) return null;
  return {
    lineCosts: Object.fromEntries(entry.lines.map((l) => [l.id, l.cost ? { unitCost: l.cost.unitCost.toFixed(2), enteredBy: l.cost.enteredBy.name, enteredAt: l.cost.enteredAt } : null])),
    supplierReturn: entry.supplierReturn
      ? {
          status: entry.supplierReturn.status as "SENT" | "CREDIT_RECEIVED",
          expectedCredit: entry.supplierReturn.expectedCredit?.toFixed(2) ?? null,
          creditAmount: entry.supplierReturn.creditAmount?.toFixed(2) ?? null,
          creditReceivedAt: entry.supplierReturn.creditReceivedAt,
        }
      : null,
  };
}
