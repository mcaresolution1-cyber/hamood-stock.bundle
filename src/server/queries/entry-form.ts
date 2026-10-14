/**
 * Everything the Stock In / Stock Out form needs, loaded once on the server. The catalogue is small
 * (hundreds of products), so the picker filters in the browser — fast on a phone, no request per
 * keystroke. Stock numbers can be a few seconds stale; the entry service re-checks on save.
 * No cost is ever selected here.
 */
import "server-only";
import { db } from "@/lib/db";
import { can, canWriteToWarehouse } from "@/lib/permissions";
import { formReasons, type Direction } from "@/lib/stock/policy";
import type { CurrentUser } from "@/server/auth/dal";

export async function loadEntryForm(user: CurrentUser, direction: Direction) {
  const [warehouses, products, levels, suppliers] = await Promise.all([
    db.warehouse.findMany({
      where: { active: true },
      select: { id: true, name: true, city: true, kind: true },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      // Q7/PB1: only ACTIVE products come in; discontinued ones can still go out; inactive ones never move.
      where: direction === "IN" ? { status: "ACTIVE" } : { status: { not: "INACTIVE" } },
      select: {
        id: true,
        modelCode: true,
        sku: true,
        barcode: true,
        nameEn: true,
        nameAr: true,
        variant: true,
        sizeRange: true,
        colour: true,
        vesa: true,
        wooSku: true,
        imageUrl: true,
        category: true,
        status: true,
      },
      orderBy: { modelCode: "asc" },
    }),
    db.stockLevel.findMany({
      where: { quantity: { gt: 0 }, warehouse: { active: true } },
      select: { productId: true, warehouseId: true, quantity: true },
    }),
    db.supplier.findMany({ where: { active: true }, select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } }),
  ]);

  const stock: Record<string, Record<string, number>> = {};
  for (const l of levels) (stock[l.warehouseId] ??= {})[l.productId] = l.quantity;

  return {
    direction,
    reasons: formReasons(user.role, direction),
    /** May enter supplier-delivery unit costs (ADMIN, MANAGER) */
    canEnterCost: can(user.role, "cost:enter"),
    /** Default salesperson on a direct sale */
    userName: user.name,
    warehouses: warehouses.map((w) => ({ ...w, writable: canWriteToWarehouse(user, w.id) })),
    products,
    stock,
    suppliers,
  };
}

export type EntryFormData = Awaited<ReturnType<typeof loadEntryForm>>;
export type FormWarehouse = EntryFormData["warehouses"][number];
export type FormProduct = EntryFormData["products"][number];
