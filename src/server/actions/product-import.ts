"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { categoryKey } from "@/lib/categories";
import { requirePermission } from "@/server/auth/dal";
import { audit } from "@/server/audit";
import { NEW_CATEGORY, type ProductImportResult } from "@/lib/import/products";
import { readImportColumns, validateImportFile } from "@/server/import/product-import";
import { withRetry } from "@/server/stock/createEntry";
import { guarded, isForeignKeyViolation, isUniqueViolation, UserFacingError, type ActionResult } from "./result";

export type ImportColumns = Awaited<ReturnType<typeof readImportColumns>>;
export type ImportPreview = ProductImportResult & {
  /** Names of the existing categories the rows use, for the preview table. */
  categoryNames: Record<string, { nameEn: string; nameAr: string }>;
};

/** Step 1: the file's columns with suggested fields (plan ui-menu-import-categories, PU3). */
export async function readProductImportColumns(formData: FormData): Promise<ActionResult<ImportColumns>> {
  return guarded(async () => {
    await requirePermission("product:manage");
    return readImportColumns(formData);
  });
}

/** Step 2: every row checked with the chosen columns. Writes nothing. */
export async function previewProductImport(formData: FormData): Promise<ActionResult<ImportPreview>> {
  return guarded(async () => {
    await requirePermission("product:manage");
    const { result } = await validateImportFile(formData);
    const ids = [...new Set(result.rows.flatMap((r) => r.data.categoryIds ?? []).filter((id) => !id.startsWith(NEW_CATEGORY)))];
    const categories = await db.category.findMany({ where: { id: { in: ids } }, select: { id: true, nameEn: true, nameAr: true } });
    return { ...result, categoryNames: Object.fromEntries(categories.map(({ id, ...names }) => [id, names])) };
  });
}

/**
 * Step 3: re-reads and re-validates the file with the same columns (never trusts the preview), then, in
 * one transaction, creates the new categories and creates/updates every row. Nothing is saved if any row
 * has an error. Never touches stock or the status (Q8). Cost changes go to the cost history. A non-empty
 * category cell replaces an existing product's categories (PU4); an empty one keeps them.
 */
export async function applyProductImport(
  formData: FormData,
): Promise<ActionResult<{ created: number; updated: number; categories: number }>> {
  return guarded(async () => {
    const actor = await requirePermission("product:manage");
    const { result } = await validateImportFile(formData);
    if (result.fileErrors.length || result.counts.error > 0) throw new UserFacingError("import.errors.fixFirst");
    const file = formData.get("file");
    const fileName = file instanceof File ? file.name.slice(0, 200) : null;

    try {
      // Retried on a deadlock: entry saves share-lock products in id order, this updates them in file order.
      await withRetry(() =>
        db.$transaction(
          async (tx) => {
            // New categories: the name as written, in both languages (rename later on the Categories page).
            const created = new Map<string, string>();
            for (const name of result.newCategories) {
              // Added by someone else since the check (or equal to it for the database): use that one.
              const existing = await tx.category.findFirst({ where: { OR: [{ nameEn: name }, { nameAr: name }] }, select: { id: true, active: true } });
              if (existing && !existing.active) throw new UserFacingError("import.errors.hiddenCategory");
              const c = existing ?? (await tx.category.create({ data: { nameEn: name, nameAr: name }, select: { id: true } }));
              created.set(categoryKey(name), c.id);
            }
            const resolve = (ids: string[]) => ids.map((id) => (id.startsWith(NEW_CATEGORY) ? created.get(id.slice(NEW_CATEGORY.length))! : id));

            const before = new Map(
              (
                await tx.product.findMany({
                  where: { modelCode: { in: result.rows.map((r) => r.modelCode) } },
                  select: { modelCode: true, cost: true },
                })
              ).map((p) => [p.modelCode, p.cost === null ? null : p.cost.toFixed(2)]),
            );
            for (const { action, data } of result.rows) {
              const { modelCode, categoryIds, ...fields } = data;
              let productId: string;
              if (action === "create") {
                const p = await tx.product.create({
                  data: {
                    ...fields,
                    modelCode,
                    sku: fields.sku ?? modelCode,
                    nameEn: fields.nameEn!,
                    nameAr: fields.nameAr!,
                    lowStockLevel: fields.lowStockLevel ?? 0,
                  },
                  select: { id: true },
                });
                productId = p.id;
              } else {
                // Empty cells were left out of `fields`, so existing values are kept (Q8).
                productId = (await tx.product.update({ where: { modelCode }, data: fields, select: { id: true } })).id;
              }
              if (categoryIds?.length) {
                await tx.productCategory.deleteMany({ where: { productId } });
                await tx.productCategory.createMany({
                  data: resolve(categoryIds).map((categoryId, position) => ({ productId, categoryId, position })),
                });
              }
              if (fields.cost !== undefined && before.get(modelCode) !== Number(fields.cost).toFixed(2)) {
                await tx.productCost.create({ data: { productId, cost: fields.cost, source: "IMPORT", changedById: actor.id } });
              }
            }
            // One summary row per import (a row per product would bury everything else in the log).
            await audit(tx, actor.id, {
              action: "product.import",
              subjectType: "product",
              subjectLabel: fileName,
              after: { fileName, created: result.counts.create, updated: result.counts.update, newCategories: result.newCategories },
            });
          },
          { timeout: 60_000, maxWait: 10_000 },
        ),
      );
    } catch (e) {
      // A category with that name was added by someone else since the check: check again.
      // A category or product changed between the check and the import (renamed, deleted): check again.
      if (isUniqueViolation(e) || isForeignKeyViolation(e)) throw new UserFacingError("import.errors.changedMeanwhile");
      throw e;
    }

    revalidatePath("/admin/products");
    revalidatePath("/admin/categories");
    return { created: result.counts.create, updated: result.counts.update, categories: result.newCategories.length };
  });
}
