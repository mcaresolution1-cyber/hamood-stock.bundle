/**
 * Read + validate a product import file against the database. Server-only helper (NOT a server action:
 * callers check permissions first — the import actions and the error-file route).
 */
import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { categoryKey, categoryMatchKey } from "@/lib/categories";
import { applyMapping, mappingProblems, suggestMapping, type ColumnMapping } from "@/lib/import/columns";
import { PRODUCT_IMPORT_COLUMNS, validateProductImport, type ProductImportResult } from "@/lib/import/products";
import type { ParsedSheet } from "@/lib/import/sheet";
import { UserFacingError } from "@/server/actions/result";
import { readSheet } from "./readSheet";

/** How many rows the column step shows under each column. */
export const SAMPLE_ROWS = 5;

const mappingSchema = z.record(z.string().regex(/^\d{1,3}$/), z.enum([...PRODUCT_IMPORT_COLUMNS, ""]));

/** The user's column choices from the form (JSON), or the suggestion when none were sent. */
function mappingFrom(formData: FormData, sheet: ParsedSheet): ColumnMapping {
  const raw = formData.get("mapping");
  if (typeof raw !== "string" || !raw) return suggestMapping(sheet.labels ?? [], samplesOf(sheet));
  let parsed: ColumnMapping;
  try {
    parsed = mappingSchema.parse(JSON.parse(raw));
  } catch {
    throw new UserFacingError("errors.invalidInput");
  }
  const width = sheet.labels?.length ?? 0;
  if (Object.keys(parsed).some((k) => Number(k) >= width)) throw new UserFacingError("import.errors.columnsChanged");
  if (mappingProblems(parsed).duplicates.length) throw new UserFacingError("import.errors.duplicateField");
  return parsed;
}

function samplesOf(sheet: ParsedSheet): string[][] {
  return (sheet.labels ?? []).map((_, i) => sheet.rows.slice(0, SAMPLE_ROWS).map((r) => r.cells[i] ?? ""));
}

/** Step 1: the file's columns, a few values of each, and the suggested field per column. */
export async function readImportColumns(formData: FormData) {
  const sheet = await readSheet(formData.get("file"));
  const labels = sheet.labels ?? [];
  if (!labels.some((l) => l) || sheet.rows.length === 0) throw new UserFacingError("import.errors.empty");
  const samples = samplesOf(sheet);
  return {
    columns: labels.map((label, index) => ({ index, label, samples: samples[index] })),
    mapping: suggestMapping(labels, samples),
    rowCount: sheet.rows.length,
  };
}

/** The name of the category made for products without one, when the user picks no existing category. */
export const DEFAULT_NEW_CATEGORY = { nameEn: "Other", nameAr: "أخرى" } as const;

/** Steps 2 and 3: the file read with the chosen columns and checked row by row. */
export async function validateImportFile(formData: FormData): Promise<{ sheet: ParsedSheet; result: ProductImportResult }> {
  const sheet = await readSheet(formData.get("file"));
  const mapped = applyMapping(sheet, mappingFrom(formData, sheet));
  return { sheet, result: validateProductImport(mapped, await importContext(formData)) };
}

async function importContext(formData: FormData) {
  const [products, suppliers, categories] = await Promise.all([
    db.product.findMany({ select: { modelCode: true, sku: true, barcode: true, categories: { select: { categoryId: true } } } }),
    db.supplier.findMany({ where: { active: true }, select: { id: true, nameEn: true, nameAr: true } }),
    db.category.findMany({ select: { id: true, nameEn: true, nameAr: true, active: true }, orderBy: [{ position: "asc" }, { nameEn: "asc" }] }),
  ]);
  const supplierByName = new Map<string, string>();
  for (const s of suppliers) {
    supplierByName.set(s.nameEn.toLowerCase(), s.id);
    if (s.nameAr) supplierByName.set(s.nameAr.toLowerCase(), s.id);
  }
  // Exact names first, then the looser keys ("WALL MOUNT" → "TV wall mounts", PS5) where they are unambiguous.
  const categoryByName = new Map<string, string>();
  const loose = new Map<string, Set<string>>();
  for (const c of categories) {
    for (const n of [c.nameEn, c.nameAr]) {
      categoryByName.set(categoryKey(n), c.id);
      const k = categoryMatchKey(n);
      (loose.get(k) ?? loose.set(k, new Set()).get(k)!).add(c.id);
    }
  }
  for (const [k, ids] of loose) if (ids.size === 1 && !categoryByName.has(k)) categoryByName.set(k, [...ids][0]);
  // Files made with the old template wrote the fixed keys ("wall-mount").
  for (const c of categories) if (c.id.startsWith("cat-") && !categoryByName.has(c.id.slice(4))) categoryByName.set(c.id.slice(4), c.id);

  const chosen = formData.get("defaultCategory");
  let defaultCategory: { id: string } | { name: string };
  if (typeof chosen === "string" && chosen) {
    const c = categories.find((x) => x.id === chosen);
    if (!c || !c.active) throw new UserFacingError("products.errors.unknownCategory");
    defaultCategory = { id: c.id };
  } else {
    // "Other" may exist already (an earlier import): use it.
    const other = categoryByName.get(categoryKey(DEFAULT_NEW_CATEGORY.nameEn)) ?? categoryByName.get(categoryKey(DEFAULT_NEW_CATEGORY.nameAr));
    defaultCategory = other ? { id: other } : { name: DEFAULT_NEW_CATEGORY.nameEn };
  }

  return {
    products: new Map(
      products.map((p) => [p.modelCode, { sku: p.sku, barcode: p.barcode, categoryIds: p.categories.map((c) => c.categoryId) }]),
    ),
    skus: new Map(products.map((p) => [p.sku.toUpperCase(), p.modelCode])),
    suppliers: supplierByName,
    categories: categoryByName,
    inactiveCategoryIds: new Set(categories.filter((c) => !c.active).map((c) => c.id)),
    defaultCategory,
  };
}

/** Choices for the stock step: active warehouses, and the suggested one per warehouse label of the file. */
export async function stockChoices(labels: readonly string[]) {
  const warehouses = await db.warehouse.findMany({ where: { active: true }, select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } });
  const key = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const suggested: Record<string, string> = {};
  for (const l of labels) {
    const match = warehouses.find((w) => key(w.name) === key(l));
    // A name not found becomes a new warehouse. Without a warehouse column: the only warehouse, else
    // the user must choose ("new" without a name blocks the import until he does).
    const only = warehouses.filter((w) => w.kind === "SELLABLE");
    suggested[l] = match ? match.id : !l && only.length === 1 ? only[0].id : NEW_WAREHOUSE;
  }
  return { warehouses, suggested };
}

/** Choice value meaning "create a warehouse with the file's name". */
export const NEW_WAREHOUSE = "new";
