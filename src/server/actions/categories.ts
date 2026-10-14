"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { id as idSchema } from "@/lib/validation/common";
import { categorySchema } from "@/lib/validation/categories";
import { requirePermission } from "@/server/auth/dal";
import { audit, changedFields } from "@/server/audit";
import { guarded, isUniqueViolation, UserFacingError, type ActionResult } from "./result";

/** Product categories (plan ui-menu-import-categories, PU2). ADMIN only, like products. */

function nameTaken(e: unknown): UserFacingError | null {
  return isUniqueViolation(e) ? new UserFacingError("categories.errors.nameTaken") : null;
}

function revalidate() {
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
}

export type CreatedCategory = { id: string; nameEn: string; nameAr: string };

export async function createCategory(values: unknown): Promise<ActionResult<CreatedCategory>> {
  return guarded(async () => {
    const actor = await requirePermission("product:manage");
    const data = categorySchema.parse(values);
    try {
      const c = await db.$transaction(async (tx) => {
        const created = await tx.category.create({ data, select: { id: true, nameEn: true, nameAr: true } });
        await audit(tx, actor.id, { action: "category.create", subjectType: "category", subjectId: created.id, subjectLabel: data.nameEn, after: data });
        return created;
      });
      revalidate();
      return c;
    } catch (e) {
      throw nameTaken(e) ?? e;
    }
  });
}

export async function updateCategory(id: string, values: unknown): Promise<ActionResult> {
  return guarded(async () => {
    const actor = await requirePermission("product:manage");
    const categoryId = idSchema.parse(id);
    const data = categorySchema.parse(values);
    try {
      await db.$transaction(async (tx) => {
        const before = await tx.category.findUnique({ where: { id: categoryId }, select: { nameEn: true, nameAr: true, position: true } });
        if (!before) throw new UserFacingError("errors.notFound");
        await tx.category.update({ where: { id: categoryId }, data });
        const diff = changedFields(before, data);
        if (diff) await audit(tx, actor.id, { action: "category.update", subjectType: "category", subjectId: categoryId, subjectLabel: data.nameEn, ...diff });
      });
    } catch (e) {
      throw nameTaken(e) ?? e;
    }
    revalidate();
    return null;
  });
}

/** Hide a category from the pickers (products keep it) or bring it back. */
export async function setCategoryActive(id: string, active: unknown): Promise<ActionResult> {
  return guarded(async () => {
    const actor = await requirePermission("product:manage");
    const categoryId = idSchema.parse(id);
    const value = z.boolean().parse(active);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM \`Category\` WHERE id = ${categoryId} FOR UPDATE`;
      const before = await tx.category.findUnique({ where: { id: categoryId }, select: { nameEn: true, active: true } });
      if (!before) throw new UserFacingError("errors.notFound");
      if (before.active === value) return;
      await tx.category.update({ where: { id: categoryId }, data: { active: value } });
      await audit(tx, actor.id, {
        action: value ? "category.activate" : "category.deactivate",
        subjectType: "category",
        subjectId: categoryId,
        subjectLabel: before.nameEn,
        before: { active: before.active },
        after: { active: value },
      });
    });
    revalidate();
    return null;
  });
}

/**
 * Delete a category no product uses (a typo, a test). One in use is deactivated instead. The row is
 * locked and the use re-counted inside the transaction; a product save adding it meanwhile fails on the
 * foreign key, so nothing is left pointing at a deleted category.
 */
export async function deleteCategory(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const actor = await requirePermission("product:manage");
    const categoryId = idSchema.parse(id);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM \`Category\` WHERE id = ${categoryId} FOR UPDATE`;
      const c = await tx.category.findUnique({ where: { id: categoryId }, select: { nameEn: true, nameAr: true, _count: { select: { products: true } } } });
      if (!c) throw new UserFacingError("errors.notFound");
      if (c._count.products > 0) throw new UserFacingError("categories.errors.inUse", { count: c._count.products });
      await tx.category.delete({ where: { id: categoryId } });
      await audit(tx, actor.id, {
        action: "category.delete",
        subjectType: "category",
        subjectId: categoryId,
        subjectLabel: c.nameEn,
        before: { nameEn: c.nameEn, nameAr: c.nameAr },
      });
    });
    revalidate();
    return null;
  });
}
