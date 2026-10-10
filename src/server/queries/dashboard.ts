import "server-only";
import { db } from "@/lib/db";
import { lowStock } from "./reports";
import { riyadhDayStart } from "./entries";

/** Today's date in Riyadh as YYYY-MM-DD. */
export function riyadhToday(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

export async function dashboardStats() {
  const todayStart = riyadhDayStart(riyadhToday());
  const [activeProducts, low, todayEntries, recent] = await Promise.all([
    db.product.count({ where: { active: true } }),
    lowStock({}),
    // a transfer counts once (its OUT half); voids aren't new activity
    db.stockEntry.count({ where: { entryDate: { gte: todayStart }, type: { notIn: ["VOID", "TRANSFER_IN"] } } }),
    db.stockEntry.findMany({
      where: { type: { not: "TRANSFER_IN" } },
      orderBy: [{ entryDate: "desc" }, { number: "desc" }],
      take: 6,
      select: {
        id: true,
        number: true,
        type: true,
        reason: true,
        entryDate: true,
        voidedAt: true,
        warehouse: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
  ]);
  return { activeProducts, lowStockCount: low.rows.length, todayEntries, recent };
}

/** Catalogue for the dashboard product search: names + total stock, never cost. */
export async function productSearchList() {
  const [products, totals] = await Promise.all([
    db.product.findMany({
      select: { id: true, modelCode: true, nameEn: true, nameAr: true, variant: true, imageUrl: true, active: true },
      orderBy: [{ active: "desc" }, { modelCode: "asc" }],
    }),
    db.stockLevel.groupBy({
      by: ["productId"],
      where: { warehouse: { active: true, kind: "SELLABLE" } },
      _sum: { quantity: true },
    }),
  ]);
  const total = new Map(totals.map((t) => [t.productId, t._sum.quantity ?? 0]));
  return products.map((p) => ({ ...p, sellable: total.get(p.id) ?? 0 }));
}
