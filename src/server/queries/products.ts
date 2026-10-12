/**
 * Product reads. `cost` is only selected for roles allowed to see it — it never leaves the server
 * otherwise (CLAUDE.md: strip cost in the query, don't just hide the column).
 */
import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/dal";

export const PRODUCT_PAGE_SIZE = 25;

export type ProductFilters = {
  q?: string;
  category?: string;
  status?: "active" | "inactive" | "all";
  page?: number;
};

export async function listProducts(user: CurrentUser, filters: ProductFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const q = filters.q?.trim();
  const where: Prisma.ProductWhereInput = {
    ...(filters.status === "all" ? {} : { active: filters.status !== "inactive" }),
    ...(filters.category ? { category: filters.category } : {}),
    ...(q
      ? {
          OR: [
            { modelCode: { contains: q } },
            { nameEn: { contains: q } },
            { nameAr: { contains: q } },
            { variant: { contains: q } },
          ],
        }
      : {}),
  };
  const showCost = can(user.role, "cost:view");

  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: [{ active: "desc" }, { modelCode: "asc" }],
      skip: (page - 1) * PRODUCT_PAGE_SIZE,
      take: PRODUCT_PAGE_SIZE,
      select: {
        id: true,
        modelCode: true,
        nameEn: true,
        nameAr: true,
        category: true,
        variant: true,
        imageUrl: true,
        lowStockLevel: true,
        active: true,
        cost: showCost,
      },
    }),
  ]);

  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE)),
    // Decimal → string so it can cross to client components; absent for non-admins.
    rows: rows.map(({ cost, ...p }) => ({ ...p, ...(showCost ? { cost: cost ? cost.toString() : null } : {}) })),
  };
}

export async function getProductForEdit(id: string) {
  const p = await db.product.findUnique({ where: { id } });
  if (!p) return null;
  return { ...p, cost: p.cost ? p.cost.toString() : null };
}
