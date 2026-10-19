"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { categoryMatchKey } from "@/lib/categories";
import { requirePermission } from "@/server/auth/dal";
import { audit } from "@/server/audit";
import { NEW_CATEGORY, type ProductImportResult } from "@/lib/import/products";
import { DEFAULT_NEW_CATEGORY, NEW_WAREHOUSE, readImportColumns, stockChoices, validateImportFile } from "@/server/import/product-import";
import { createEntryInTx, nextCounterValue, withRetry } from "@/server/stock/createEntry";
import { formatSku } from "@/lib/products";
import { SKU_COUNTER } from "@/lib/stock/numbering";
import { can } from "@/lib/permissions";
import { z } from "zod";
import { guarded, isForeignKeyViolation, isUniqueViolation, UserFacingError, type ActionResult } from "./result";

export type ImportColumns = Awaited<ReturnType<typeof readImportColumns>>;
export type ImportPreview = ProductImportResult & {
  /** Names of the existing categories the rows use, for the preview table. */
  categoryNames: Record<string, { nameEn: string; nameAr: string }>;
  /** For the "products without a category" choice: the categories that can be picked. */
  categoryOptions: { id: string; nameEn: string; nameAr: string }[];
  /** For the stock step: active warehouses and the suggested one per warehouse label of the file. */
  stock: Awaited<ReturnType<typeof stockChoices>>;
};
export type ImportDone = { created: number; updated: number; categories: number; warehouses: number; entries: string[] };

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
    const [categories, categoryOptions, stock] = await Promise.all([
      db.category.findMany({ where: { id: { in: ids } }, select: { id: true, nameEn: true, nameAr: true } }),
      db.category.findMany({ where: { active: true }, select: { id: true, nameEn: true, nameAr: true }, orderBy: [{ position: "asc" }, { nameEn: "asc" }] }),
      stockChoices(result.locations.map((l) => l.label)),
    ]);
    return { ...result, categoryNames: Object.fromEntries(categories.map(({ id, ...names }) => [id, names])), categoryOptions, stock };
  });
}

const locationsSchema = z.record(z.string().max(200), z.string().max(64));

/**
 * Step 3: re-reads and re-validates the file with the same choices (never trusts the preview), then, in
 * one transaction: creates the new categories and warehouses, creates/updates every product (new ones get
 * the next HMD00 SKU, PS1), and saves the stock of new products as one opening-stock entry per warehouse
 * through the entry service (PS4). Nothing is saved if any row has an error. Never changes the status (Q8).
 * Cost changes go to the cost history. A non-empty category cell replaces an existing product's
 * categories (PU4); an empty one keeps them.
 */
export async function applyProductImport(formData: FormData): Promise<ActionResult<ImportDone>> {
  return guarded(async () => {
    const actor = await requirePermission("product:manage");
    const { result } = await validateImportFile(formData);
    if (result.fileErrors.length || result.counts.error > 0) throw new UserFacingError("import.errors.fixFirst");
    const file = formData.get("file");
    const fileName = file instanceof File ? file.name.slice(0, 200) : null;

    // Where each warehouse label's stock goes: a warehouse id, "new" (create it), or "" (leave the stock out).
    let choices: Record<string, string> = {};
    try {
      choices = locationsSchema.parse(JSON.parse(String(formData.get("locations") ?? "{}")));
    } catch {
      throw new UserFacingError("errors.invalidInput");
    }
    const stocked = result.locations.filter((l) => choices[l.label]);
    if (stocked.length && !can(actor.role, "openingStock:import")) throw new UserFacingError("errors.forbidden");
    for (const l of stocked) if (choices[l.label] === NEW_WAREHOUSE && !l.label) throw new UserFacingError("import.errors.chooseWarehouse");
    // Creating warehouses is a warehouse-manager right, like the Warehouses page.
    if (stocked.some((l) => choices[l.label] === NEW_WAREHOUSE) && !can(actor.role, "warehouse:manage")) throw new UserFacingError("errors.forbidden");

    const heads = result.rows.filter((r) => r.action === "create" || r.action === "update");
    let done: ImportDone = { created: 0, updated: 0, categories: 0, warehouses: 0, entries: [] };
    try {
      // Retried on a deadlock: entry saves share-lock products in id order, this writes them in file order.
      done = await withRetry(() =>
        db.$transaction(
          async (tx) => {
            // New categories, tidied names in both languages (rename later on the Categories page).
            const createdCategories = new Map<string, string>();
            for (const name of result.newCategories) {
              // Added by someone else since the check (or equal to it for the database): use that one.
              const existing = await tx.category.findFirst({ where: { OR: [{ nameEn: name }, { nameAr: name }] }, select: { id: true, active: true } });
              if (existing && !existing.active) throw new UserFacingError("import.errors.hiddenCategory");
              const nameAr = name === DEFAULT_NEW_CATEGORY.nameEn ? DEFAULT_NEW_CATEGORY.nameAr : name;
              const c = existing ?? (await tx.category.create({ data: { nameEn: name, nameAr }, select: { id: true } }));
              createdCategories.set(categoryMatchKey(name), c.id);
            }
            const resolve = (ids: string[]) =>
              ids.map((id) => (id.startsWith(NEW_CATEGORY) ? createdCategories.get(id.slice(NEW_CATEGORY.length))! : id));

            // Warehouses for the stock: chosen ones must be active; "new" ones are created (or found by name).
            const warehouseOf = new Map<string, string>();
            let newWarehouses = 0;
            for (const l of stocked) {
              const choice = choices[l.label];
              if (choice === NEW_WAREHOUSE) {
                const name = l.label.slice(0, 100);
                const found = await tx.warehouse.findFirst({ where: { name }, select: { id: true, active: true } });
                if (found && !found.active) throw new UserFacingError("stock.errors.warehouseInactive");
                const w = found ?? (await tx.warehouse.create({ data: { name, city: "", kind: "SELLABLE" }, select: { id: true } }));
                if (!found) {
                  newWarehouses++;
                  await audit(tx, actor.id, { action: "warehouse.create", subjectType: "warehouse", subjectId: w.id, subjectLabel: name, after: { name, kind: "SELLABLE", fileName } });
                }
                warehouseOf.set(l.label, w.id);
              } else {
                const w = await tx.warehouse.findFirst({ where: { id: choice, active: true }, select: { id: true } });
                if (!w) throw new UserFacingError("stock.errors.warehouseInactive");
                warehouseOf.set(l.label, w.id);
              }
            }

            const before = new Map(
              (await tx.product.findMany({ where: { modelCode: { in: heads.map((r) => r.modelCode) } }, select: { modelCode: true, cost: true } })).map(
                (p) => [p.modelCode, p.cost === null ? null : p.cost.toFixed(2)],
              ),
            );
            const lines = new Map<string, { productId: string; quantity: number }[]>(); // warehouse id → lines
            let created = 0;
            let updated = 0;
            for (const { action, data } of heads) {
              const { modelCode, categoryIds, stock, ...fields } = data;
              let productId: string;
              if (action === "create") {
                const sku = formatSku(await nextCounterValue(tx, SKU_COUNTER)); // next in order (PS1)
                const p = await tx.product.create({
                  data: {
                    ...fields,
                    modelCode,
                    sku,
                    nameEn: fields.nameEn!,
                    nameAr: fields.nameAr ?? fields.nameEn!, // one name is enough (PS2)
                    lowStockLevel: fields.lowStockLevel ?? 0,
                  },
                  select: { id: true },
                });
                productId = p.id;
                created++;
                for (const s of stock ?? []) {
                  const wid = warehouseOf.get(s.location);
                  if (wid) (lines.get(wid) ?? lines.set(wid, []).get(wid)!).push({ productId, quantity: s.quantity });
                }
              } else {
                // Empty cells were left out of `fields`, so existing values are kept (Q8).
                productId = (await tx.product.update({ where: { modelCode }, data: fields, select: { id: true } })).id;
                updated++;
              }
              if (categoryIds?.length) {
                await tx.productCategory.deleteMany({ where: { productId } });
                await tx.productCategory.createMany({ data: resolve(categoryIds).map((categoryId, position) => ({ productId, categoryId, position })) });
              }
              if (fields.cost !== undefined && before.get(modelCode) !== Number(fields.cost).toFixed(2)) {
                await tx.productCost.create({ data: { productId, cost: fields.cost, source: "IMPORT", changedById: actor.id } });
              }
            }

            // Stock only through the ledger: one opening-stock entry per warehouse (CLAUDE.md, PS4).
            const entries: string[] = [];
            for (const [warehouseId, list] of lines) {
              const e = await createEntryInTx(tx, actor, {
                direction: "IN",
                reason: "OPENING_STOCK",
                warehouseId,
                lines: list,
                note: fileName ?? undefined,
              });
              entries.push(e.number);
            }

            // One summary row per import (a row per product would bury everything else in the log).
            await audit(tx, actor.id, {
              action: "product.import",
              subjectType: "product",
              subjectLabel: fileName,
              after: { fileName, created, updated, newCategories: result.newCategories, entries },
            });
            return { created, updated, categories: result.newCategories.length, warehouses: newWarehouses, entries };
          },
          { timeout: 120_000, maxWait: 10_000 },
        ),
      );
    } catch (e) {
      // A category, warehouse or product changed between the check and the import (renamed, deleted): check again.
      if (isUniqueViolation(e) || isForeignKeyViolation(e)) throw new UserFacingError("import.errors.changedMeanwhile");
      throw e;
    }

    revalidatePath("/");
    revalidatePath("/admin/products");
    revalidatePath("/admin/categories");
    revalidatePath("/admin/warehouses");
    return done;
  });
}
