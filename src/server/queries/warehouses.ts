import "server-only";
import { db } from "@/lib/db";

export async function listWarehouses() {
  const [warehouses, totals] = await Promise.all([
    db.warehouse.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.stockLevel.groupBy({ by: ["warehouseId"], _sum: { quantity: true } }),
  ]);
  const units = new Map(totals.map((t) => [t.warehouseId, t._sum.quantity ?? 0]));
  return warehouses.map((w) => ({ ...w, units: units.get(w.id) ?? 0 }));
}

export type WarehouseRow = Awaited<ReturnType<typeof listWarehouses>>[number];

export async function activeWarehouseOptions() {
  return db.warehouse.findMany({
    where: { active: true },
    select: { id: true, name: true, city: true, kind: true },
    orderBy: { name: "asc" },
  });
}
