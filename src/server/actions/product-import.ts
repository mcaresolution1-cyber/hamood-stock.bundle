"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/dal";
import { audit } from "@/server/audit";
import type { ProductImportResult } from "@/lib/import/products";
import { validateImportFile } from "@/server/import/product-import";
import { guarded, UserFacingError, type ActionResult } from "./result";

async function validate(formData: FormData): Promise<ProductImportResult> {
  return (await validateImportFile(formData)).result;
}

export async function previewProductImport(formData: FormData): Promise<ActionResult<ProductImportResult>> {
  return guarded(async () => {
    await requirePermission("product:manage");
    return validate(formData);
  });
}

/**
 * Re-reads and re-validates the file (never trusts the preview), then creates/updates every row in
 * one transaction. Nothing is saved if any row has an error. Never touches stock or the status (Q8).
 * Cost changes are added to the cost history.
 */
export async function applyProductImport(
  formData: FormData,
): Promise<ActionResult<{ created: number; updated: number }>> {
  return guarded(async () => {
    const actor = await requirePermission("product:manage");
    const result = await validate(formData);
    if (result.fileErrors.length || result.counts.error > 0) throw new UserFacingError("import.errors.fixFirst");
    const file = formData.get("file");
    const fileName = file instanceof File ? file.name.slice(0, 200) : null;

    await db.$transaction(
      async (tx) => {
        const before = new Map(
          (await tx.product.findMany({ where: { modelCode: { in: result.rows.map((r) => r.modelCode) } }, select: { modelCode: true, cost: true } })).map(
            (p) => [p.modelCode, p.cost === null ? null : p.cost.toFixed(2)],
          ),
        );
        for (const { action, data } of result.rows) {
          const { modelCode, ...fields } = data;
          let productId: string;
          if (action === "create") {
            const created = await tx.product.create({
              data: {
                ...fields,
                modelCode,
                sku: fields.sku ?? modelCode,
                nameEn: fields.nameEn!,
                nameAr: fields.nameAr!,
                category: fields.category!,
                lowStockLevel: fields.lowStockLevel ?? 0,
              },
              select: { id: true },
            });
            productId = created.id;
          } else {
            // Empty cells were left out of `fields`, so existing values are kept (Q8).
            productId = (await tx.product.update({ where: { modelCode }, data: fields, select: { id: true } })).id;
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
          after: { fileName, created: result.counts.create, updated: result.counts.update },
        });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    revalidatePath("/admin/products");
    return { created: result.counts.create, updated: result.counts.update };
  });
}
