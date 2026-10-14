/** Product page: stock per warehouse + the product's stock card (every movement, running balance). */
import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { EntryReason, EntryType, WarehouseKind } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/dal";
import { SIGNED_QTY } from "./reports";
import { lowStockOf } from "@/lib/stock/low-stock";

export const STOCK_CARD_LIMIT = 200;

/** Model code only — for page titles, so metadata doesn't re-run the stock card query. */
export async function productModelCode(productId: string) {
  return (await db.product.findUnique({ where: { id: productId }, select: { modelCode: true } }))?.modelCode ?? null;
}

/**
 * Running balance: with a warehouse chosen, the balance in that warehouse; with "all warehouses", the
 * company-wide balance across every warehouse, damaged included, so it ends at the product's total
 * (decision B12). The two halves of a transfer cancel out in the all-warehouses balance.
 */
export async function getProductStock(user: CurrentUser, productId: string, warehouseId?: string) {
  const showCost = can(user.role, "cost:view");
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      modelCode: true,
      nameEn: true,
      nameAr: true,
      category: true,
      sku: true,
      barcode: true,
      variant: true,
      sizeRange: true,
      colour: true,
      maxLoadKg: true,
      vesa: true,
      imageUrl: true,
      lowStockLevel: true,
      sellingPrice: true,
      status: true,
      cost: showCost,
      defaultSupplier: { select: { nameEn: true, nameAr: true } },
      reorder: { select: { warehouseId: true, reorderLevel: true, reorderQty: true } },
      costs: showCost
        ? { orderBy: { at: "desc" }, take: 20, select: { id: true, cost: true, source: true, at: true, changedBy: { select: { name: true } } } }
        : false,
    },
  });
  if (!product) return null;

  const [warehouses, levels] = await Promise.all([
    db.warehouse.findMany({ select: { id: true, name: true, kind: true, active: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.stockLevel.findMany({ where: { productId }, select: { warehouseId: true, quantity: true } }),
  ]);
  const qty = new Map(levels.map((l) => [l.warehouseId, l.quantity]));
  const perWarehouse = warehouses
    .filter((w) => w.active || (qty.get(w.id) ?? 0) > 0)
    .map((w) => ({ ...w, quantity: qty.get(w.id) ?? 0 }));
  const sellable = perWarehouse.filter((w) => w.kind === "SELLABLE" && w.active).reduce((s, w) => s + w.quantity, 0);
  const total = perWarehouse.reduce((s, w) => s + w.quantity, 0);

  // Running balance over the WHOLE history (window), then show the newest rows first.
  const whereWarehouse = warehouseId ? Prisma.sql`AND e.warehouseId = ${warehouseId}` : Prisma.empty;
  const card = await db.$queryRaw<
    {
      entryId: string;
      number: string;
      type: EntryType;
      reason: EntryReason;
      entryDate: Date;
      voided: boolean | number | bigint;
      warehouse: string;
      change: number | bigint | string;
      balance: number | bigint | string;
    }[]
  >`
    SELECT e.id AS entryId, e.\`number\`, e.type, e.reason, e.entryDate,
           (e.voidedAt IS NOT NULL) AS voided,
           w.name AS warehouse,
           CAST(${SIGNED_QTY} AS SIGNED) AS \`change\`,
           CAST(SUM(${SIGNED_QTY}) OVER (ORDER BY e.entryDate, e.createdAt, e.id ROWS UNBOUNDED PRECEDING) AS SIGNED) AS balance
    FROM StockEntryLine l
    JOIN StockEntry e ON e.id = l.entryId
    JOIN Warehouse w ON w.id = e.warehouseId
    LEFT JOIN StockEntry v ON v.id = e.linkedEntryId AND e.type = 'VOID'
    WHERE l.productId = ${productId} ${whereWarehouse}
    ORDER BY e.entryDate DESC, e.createdAt DESC, e.id DESC
    LIMIT ${STOCK_CARD_LIMIT}`;

  const { costs, sellingPrice, reorder, ...rest } = product;
  const low = lowStockOf({
    lowStockLevel: product.lowStockLevel,
    qty: Object.fromEntries(perWarehouse.map((w) => [w.id, w.quantity])),
    reorder,
    sellableWarehouseIds: perWarehouse.filter((w) => w.kind === "SELLABLE" && w.active).map((w) => w.id),
  });
  return {
    product: {
      ...rest,
      sellingPrice: sellingPrice ? sellingPrice.toFixed(2) : null,
      reorder,
      ...(showCost
        ? {
            cost: (product as { cost?: Prisma.Decimal | null }).cost?.toFixed(2) ?? null,
            costHistory: ((costs ?? []) as unknown as { id: string; cost: Prisma.Decimal | null; source: string; at: Date; changedBy: { name: string } }[]).map((c) => ({
              ...c,
              cost: c.cost ? c.cost.toFixed(2) : null,
            })),
          }
        : {}),
    },
    perWarehouse: perWarehouse as (typeof perWarehouse[number] & { kind: WarehouseKind })[],
    sellable,
    total,
    card: card.map((r) => ({ ...r, voided: Boolean(Number(r.voided)), change: Number(r.change), balance: Number(r.balance) })),
    lowStock: product.status === "ACTIVE" && low.low,
  };
}
