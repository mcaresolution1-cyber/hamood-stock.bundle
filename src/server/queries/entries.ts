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
  page?: number;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Start of a Riyadh calendar day (UTC+3, no daylight saving) as a UTC instant. */
export function riyadhDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}

export function entryWhere(f: EntryFilters): Prisma.StockEntryWhereInput {
  const entryDate: Prisma.DateTimeFilter = {};
  if (f.from && DAY.test(f.from)) entryDate.gte = riyadhDayStart(f.from);
  if (f.to && DAY.test(f.to)) entryDate.lt = new Date(riyadhDayStart(f.to).getTime() + 86_400_000);
  const product = f.product?.trim();
  return {
    ...(entryDate.gte || entryDate.lt ? { entryDate } : {}),
    ...(f.warehouseId ? { warehouseId: f.warehouseId } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.reason ? { reason: f.reason } : {}),
    ...(f.userId ? { createdById: f.userId } : {}),
    ...(product ? { lines: { some: { product: { modelCode: { contains: product, mode: "insensitive" } } } } } : {}),
  };
}

export async function listEntries(f: EntryFilters) {
  const page = Math.max(1, f.page ?? 1);
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
        lines: { select: { quantity: true } },
      },
    }),
  ]);
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / ENTRY_PAGE_SIZE)),
    rows: rows.map(({ lines, ...e }) => ({ ...e, units: lines.reduce((s, l) => s + l.quantity, 0), lineCount: lines.length })),
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
      voidedAt: true,
      warehouse: { select: { id: true, name: true, city: true, kind: true } },
      createdBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
      linkedEntry: { select: { id: true, number: true, type: true, warehouse: { select: { name: true } } } },
      linkedFrom: {
        select: { id: true, number: true, type: true, note: true, warehouse: { select: { name: true } } },
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
