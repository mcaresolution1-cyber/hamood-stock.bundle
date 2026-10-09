"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/dal";
import { validateProductImport, type ProductImportResult } from "@/lib/import/products";
import { readSheet } from "@/server/import/readSheet";
import { guarded, UserFacingError, type ActionResult } from "./result";

async function validate(formData: FormData): Promise<ProductImportResult> {
  const sheet = await readSheet(formData.get("file"));
  const existing = await db.product.findMany({ select: { modelCode: true } });
  return validateProductImport(sheet, new Set(existing.map((p) => p.modelCode)));
}

export async function previewProductImport(formData: FormData): Promise<ActionResult<ProductImportResult>> {
  return guarded(async () => {
    await requirePermission("product:manage");
    return validate(formData);
  });
}

/**
 * Re-reads and re-validates the file (never trusts the preview), then creates/updates every row in
 * one transaction. Nothing is saved if any row has an error. Never touches stock or `active` (Q8).
 */
export async function applyProductImport(
  formData: FormData,
): Promise<ActionResult<{ created: number; updated: number }>> {
  return guarded(async () => {
    await requirePermission("product:manage");
    const result = await validate(formData);
    if (result.fileErrors.length || result.counts.error > 0) throw new UserFacingError("import.errors.fixFirst");

    await db.$transaction(
      async (tx) => {
        for (const { action, data } of result.rows) {
          const { modelCode, ...fields } = data;
          if (action === "create") {
            await tx.product.create({
              data: {
                modelCode,
                nameEn: fields.nameEn!,
                nameAr: fields.nameAr!,
                category: fields.category!,
                variant: fields.variant ?? null,
                imageUrl: fields.imageUrl ?? null,
                cost: fields.cost ?? null,
                lowStockLevel: fields.lowStockLevel ?? 0,
              },
            });
          } else {
            // Empty cells were left out of `fields`, so existing values are kept (Q8).
            await tx.product.update({ where: { modelCode }, data: fields });
          }
        }
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    revalidatePath("/admin/products");
    return { created: result.counts.create, updated: result.counts.update };
  });
}
