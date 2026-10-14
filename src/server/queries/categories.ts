/** Category reads (plan ui-menu-import-categories, PU2). */
import "server-only";
import { db } from "@/lib/db";

/** Prisma `select` for a product's categories, main one first. */
export const productCategoriesSelect = {
  categories: {
    orderBy: [{ position: "asc" as const }, { categoryId: "asc" as const }],
    select: { category: { select: { id: true, nameEn: true, nameAr: true } } },
  },
};

/** Categories for filters and the product form: active ones, plus `keepIds` (a product's own, even if inactive). */
export async function categoryOptions(keepIds: readonly string[] = []) {
  return db.category.findMany({
    where: { OR: [{ active: true }, ...(keepIds.length ? [{ id: { in: [...keepIds] } }] : [])] },
    orderBy: [{ position: "asc" }, { nameEn: "asc" }],
    select: { id: true, nameEn: true, nameAr: true, active: true },
  });
}

/** The admin list: every category with how many products use it. */
export async function listCategories() {
  const rows = await db.category.findMany({
    orderBy: [{ active: "desc" }, { position: "asc" }, { nameEn: "asc" }],
    select: { id: true, nameEn: true, nameAr: true, active: true, position: true, _count: { select: { products: true } } },
  });
  return rows.map(({ _count, ...c }) => ({ ...c, products: _count.products }));
}

/** A `category` URL parameter is kept only when it is an existing category id. */
export async function parseCategoryParam(value: unknown): Promise<string | undefined> {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string" || !/^[\w-]{1,64}$/.test(v)) return undefined;
  return (await db.category.count({ where: { id: v } })) ? v : undefined;
}
