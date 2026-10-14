/**
 * Product reads. `cost` and stock value are only selected for roles allowed to see them — they never
 * leave the server otherwise (CLAUDE.md: strip cost in the query, don't just hide the column).
 */
import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { can } from "@/lib/permissions";
import { PRODUCT_STATUSES, type ProductStatusName } from "@/lib/products";
import type { CurrentUser } from "@/server/auth/dal";
import { effectiveCosts } from "@/server/stock/costs";
import { categoryOptions, productCategoriesSelect } from "@/server/queries/categories";

export const PRODUCT_PAGE_SIZE = 25;
export const PRODUCT_EXPORT_LIMIT = 5000;

/** "current" = Active + Discontinued (the default list), or one status, or all. */
export type ProductStatusFilter = "current" | ProductStatusName | "all";

export type ProductFilters = {
  q?: string;
  category?: string;
  status?: ProductStatusFilter;
  page?: number;
};

export function parseProductFilters(sp: Record<string, string | string[] | undefined>): ProductFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const status = one(sp.status);
  return {
    q: one(sp.q).slice(0, 100),
    category: /^[\w-]{1,64}$/.test(one(sp.category)) ? one(sp.category) : undefined,
    status: (["current", "all", ...PRODUCT_STATUSES] as string[]).includes(status) ? (status as ProductStatusFilter) : "current",
    page: Math.min(10_000, Math.max(1, Math.trunc(Number(one(sp.page))) || 1)),
  };
}

function productWhere(filters: ProductFilters): Prisma.ProductWhereInput {
  const q = filters.q?.trim();
  const status = filters.status ?? "current";
  return {
    ...(status === "all" ? {} : status === "current" ? { status: { not: "INACTIVE" } } : { status }),
    ...(filters.category ? { categories: { some: { categoryId: filters.category } } } : {}),
    ...(q
      ? {
          OR: [
            { modelCode: { contains: q } },
            { sku: { contains: q } },
            { barcode: { contains: q } },
            { nameEn: { contains: q } },
            { nameAr: { contains: q } },
            { variant: { contains: q } },
            { sizeRange: { contains: q } },
            { colour: { contains: q } },
            { vesa: { contains: q } },
          ],
        }
      : {}),
  };
}

/**
 * Products list (Phase B): stock per active warehouse, total sellable / damaged and — for cost roles —
 * cost and stock value (cost × all units shown, B14). `page: null` returns every row (Excel export).
 */
export async function listProducts(user: CurrentUser, filters: ProductFilters, opts: { all?: boolean } = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const where = productWhere(filters);
  const showCost = can(user.role, "cost:view");

  const [total, rows, warehouses] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: [{ status: "asc" }, { modelCode: "asc" }],
      skip: opts.all ? 0 : (page - 1) * PRODUCT_PAGE_SIZE,
      take: opts.all ? PRODUCT_EXPORT_LIMIT : PRODUCT_PAGE_SIZE,
      select: {
        id: true,
        modelCode: true,
        sku: true,
        barcode: true,
        nameEn: true,
        nameAr: true,
        ...productCategoriesSelect,
        variant: true,
        sizeRange: true,
        colour: true,
        maxLoadKg: true,
        vesa: true,
        imageUrl: true,
        sellingPrice: true,
        lowStockLevel: true,
        status: true,
        cost: showCost,
        levels: { where: { quantity: { gt: 0 } }, select: { warehouseId: true, quantity: true } },
      },
    }),
    db.warehouse.findMany({ where: { active: true }, select: { id: true, name: true, kind: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
  ]);
  const kindOf = new Map(warehouses.map((w) => [w.id, w.kind]));
  // Stock value uses the weighted-average delivery cost where known, else the product's own cost (PC3).
  const costs = showCost
    ? await effectiveCosts(db, rows.map((r) => ({ id: r.id, cost: ((r as { cost?: Prisma.Decimal | null }).cost ?? null) })))
    : new Map<string, Prisma.Decimal | null>();

  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE)),
    warehouses,
    showCost,
    rows: rows.map(({ cost, levels, sellingPrice, ...p }) => {
      const qty = Object.fromEntries(levels.filter((l) => kindOf.has(l.warehouseId)).map((l) => [l.warehouseId, l.quantity]));
      const sellable = levels.filter((l) => kindOf.get(l.warehouseId) === "SELLABLE").reduce((s, l) => s + l.quantity, 0);
      const damaged = levels.filter((l) => kindOf.get(l.warehouseId) === "DAMAGED").reduce((s, l) => s + l.quantity, 0);
      const units = sellable + damaged;
      void cost;
      const c = costs.get(p.id) ?? null;
      return {
        ...p,
        sellingPrice: sellingPrice ? sellingPrice.toFixed(2) : null,
        qty,
        sellable,
        damaged,
        // Decimal → string so it can cross to client components; absent for roles without cost:view.
        ...(showCost ? { cost: c ? c.toFixed(2) : null, value: c ? c.mul(units).toFixed(2) : null } : {}),
      };
    }),
  };
}

export type ProductListRow = Awaited<ReturnType<typeof listProducts>>["rows"][number];

/** Everything the edit form needs, as form text. Only called on product:manage pages (cost included). */
export async function getProductForEdit(id: string) {
  const p = await db.product.findUnique({
    where: { id },
    include: {
      reorder: { select: { warehouseId: true, reorderLevel: true, reorderQty: true } },
      categories: { orderBy: [{ position: "asc" }, { categoryId: "asc" }], select: { categoryId: true } },
    },
  });
  if (!p) return null;
  const text = (v: string | number | null) => (v === null ? "" : String(v));
  return {
    id: p.id,
    values: {
      modelCode: p.modelCode,
      sku: p.sku,
      barcode: text(p.barcode),
      nameEn: p.nameEn,
      nameAr: p.nameAr,
      categoryIds: p.categories.map((c) => c.categoryId),
      status: p.status,
      variant: text(p.variant),
      sizeRange: text(p.sizeRange),
      colour: text(p.colour),
      maxLoadKg: text(p.maxLoadKg),
      vesa: text(p.vesa),
      imageUrl: text(p.imageUrl),
      cost: p.cost ? p.cost.toFixed(2) : "",
      sellingPrice: p.sellingPrice ? p.sellingPrice.toFixed(2) : "",
      lowStockLevel: String(p.lowStockLevel),
      leadTimeDays: text(p.leadTimeDays),
      wooProductId: text(p.wooProductId),
      wooSku: text(p.wooSku),
      defaultSupplierId: p.defaultSupplierId ?? "",
    },
    reorder: p.reorder,
  };
}

/** Options for the product form: suppliers (active, plus the product's current one) and warehouses. */
export async function productFormOptions(currentSupplierId?: string | null, currentCategoryIds: readonly string[] = []) {
  const [suppliers, warehouses, categories] = await Promise.all([
    db.supplier.findMany({
      where: { OR: [{ active: true }, ...(currentSupplierId ? [{ id: currentSupplierId }] : [])] },
      select: { id: true, nameEn: true, nameAr: true },
      orderBy: { nameEn: "asc" },
    }),
    db.warehouse.findMany({ where: { active: true, kind: "SELLABLE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    categoryOptions(currentCategoryIds),
  ]);
  return { suppliers, warehouses, categories };
}
