/**
 * Product import validation. Pure: takes parsed rows + existing products, returns a per-row verdict.
 * Decisions (docs/plans/v1.md): Q8 — an empty cell keeps the existing value and import never changes
 * the active flag; Q9 — fixed categories, accepted as key or English/Arabic label.
 */
import { CATEGORIES, categoryFromText } from "@/lib/products";
import { normalizeModelCode, parseMoney, parseWholeNumber } from "./normalize";
import type { ParsedSheet } from "./sheet";

export const PRODUCT_IMPORT_COLUMNS = [
  "modelcode",
  "nameen",
  "namear",
  "category",
  "variant",
  "imageurl",
  "cost",
  "lowstocklevel",
] as const;

export type ProductImportData = {
  modelCode: string;
  nameEn?: string;
  nameAr?: string;
  category?: string;
  variant?: string;
  imageUrl?: string;
  cost?: string;
  lowStockLevel?: number;
};

export type RowError = { field: string; key: string };

export type ProductImportRow = {
  row: number;
  modelCode: string;
  action: "create" | "update" | "error";
  errors: RowError[];
  data: ProductImportData;
};

export type ProductImportResult = {
  /** File-level problems (missing columns, empty file). */
  fileErrors: string[];
  rows: ProductImportRow[];
  counts: { create: number; update: number; error: number };
};

const MAX_TEXT = 200;

export function validateProductImport(sheet: ParsedSheet, existingCodes: ReadonlySet<string>): ProductImportResult {
  const fileErrors: string[] = [];
  if (!sheet.headers.includes("modelcode")) fileErrors.push("import.errors.missingModelCode");
  if (sheet.rows.length === 0) fileErrors.push("import.errors.empty");
  if (fileErrors.length) return { fileErrors, rows: [], counts: { create: 0, update: 0, error: 0 } };

  const seen = new Map<string, number>();
  const rows = sheet.rows.map(({ row, values }): ProductImportRow => {
    const errors: RowError[] = [];
    const get = (k: string) => (values[k] ?? "").trim();
    const modelCode = normalizeModelCode(get("modelcode"));
    const isUpdate = existingCodes.has(modelCode);
    const data: ProductImportData = { modelCode };

    if (!modelCode) errors.push({ field: "modelCode", key: "validation.required" });
    else if (modelCode.length > 50) errors.push({ field: "modelCode", key: "validation.tooLong" });
    else if (seen.has(modelCode)) errors.push({ field: "modelCode", key: "import.errors.duplicateInFile" });
    if (modelCode) seen.set(modelCode, row);

    for (const [field, key] of [
      ["nameEn", "nameen"],
      ["nameAr", "namear"],
    ] as const) {
      const v = get(key);
      if (v) {
        if (v.length > MAX_TEXT) errors.push({ field, key: "validation.tooLong" });
        else data[field] = v;
      } else if (!isUpdate) errors.push({ field, key: "validation.required" });
    }

    const categoryText = get("category");
    if (categoryText) {
      const category = categoryFromText(categoryText);
      if (category) data.category = category;
      else errors.push({ field: "category", key: "import.errors.unknownCategory" });
    } else if (!isUpdate) errors.push({ field: "category", key: "validation.required" });

    const variant = get("variant");
    if (variant) {
      if (variant.length > MAX_TEXT) errors.push({ field: "variant", key: "validation.tooLong" });
      else data.variant = variant;
    }

    const imageUrl = get("imageurl");
    if (imageUrl) {
      if (isHttpUrl(imageUrl)) data.imageUrl = imageUrl;
      else errors.push({ field: "imageUrl", key: "validation.url" });
    }

    const cost = get("cost");
    if (cost) {
      const parsed = parseMoney(cost);
      if (parsed === null) errors.push({ field: "cost", key: "validation.money" });
      else data.cost = parsed;
    }

    const low = get("lowstocklevel");
    if (low) {
      const parsed = parseWholeNumber(low);
      if (parsed === null) errors.push({ field: "lowStockLevel", key: "validation.wholeNumber" });
      else data.lowStockLevel = parsed;
    }

    return { row, modelCode, action: errors.length ? "error" : isUpdate ? "update" : "create", errors, data };
  });

  const counts = { create: 0, update: 0, error: 0 };
  for (const r of rows) counts[r.action]++;
  return { fileErrors, rows, counts };
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export { CATEGORIES };
