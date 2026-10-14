/**
 * Product import validation. Pure: takes parsed rows + what the database holds, returns a per-row verdict.
 * Decisions (docs/plans/v1.md): Q8 — an empty cell keeps the existing value and import never changes
 * the product status. Categories (plan ui-menu-import-categories, PU4): one or more per cell, matched by English
 * or Arabic name; unknown names are listed and created on import.
 * Phase B: SKU / barcode must be unique (file + database), supplier given by its English or Arabic name.
 */
import { categoryKey, MAX_PRODUCT_CATEGORIES, splitCategoryCell } from "@/lib/categories";
import { normalizeModelCode, parseMoney, parseWholeNumber, toWesternDigits } from "./normalize";
import type { ParsedSheet } from "./sheet";

export const PRODUCT_IMPORT_COLUMNS = [
  "modelcode",
  "sku",
  "barcode",
  "nameen",
  "namear",
  "category",
  "sizerange",
  "colour",
  "maxloadkg",
  "vesa",
  "variant",
  "imageurl",
  "cost",
  "sellingprice",
  "lowstocklevel",
  "leadtimedays",
  "wooproductid",
  "woosku",
  "supplier",
] as const;

/** Header names for the template and the error file (the import also accepts any spacing/case). */
export const PRODUCT_TEMPLATE_HEADERS = [
  "modelCode",
  "sku",
  "barcode",
  "nameEn",
  "nameAr",
  "category",
  "sizeRange",
  "colour",
  "maxLoadKg",
  "vesa",
  "variant",
  "imageUrl",
  "cost",
  "sellingPrice",
  "lowStockLevel",
  "leadTimeDays",
  "wooProductId",
  "wooSku",
  "supplier",
] as const;

export type ProductImportData = {
  modelCode: string;
  sku?: string;
  barcode?: string;
  nameEn?: string;
  nameAr?: string;
  /**
   * Categories in the order written: an existing category's id, or `new:<categoryKey>` for a name that
   * doesn't exist yet (created on import, see ProductImportResult.newCategories).
   */
  categoryIds?: string[];
  sizeRange?: string;
  colour?: string;
  maxLoadKg?: number;
  vesa?: string;
  variant?: string;
  imageUrl?: string;
  cost?: string;
  sellingPrice?: string;
  lowStockLevel?: number;
  leadTimeDays?: number;
  wooProductId?: number;
  wooSku?: string;
  defaultSupplierId?: string;
};

/** Prefix of a category that the import will create (`new:<categoryKey>`). */
export const NEW_CATEGORY = "new:";

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
  /** Category names that don't exist yet and will be created, as first written in the file. */
  newCategories: string[];
};

/** What the database already holds, for the duplicate and lookup checks. */
export type ProductImportContext = {
  /** model code → its current SKU, barcode and categories */
  products: ReadonlyMap<string, { sku: string; barcode: string | null; categoryIds?: readonly string[] }>;
  /** lower-cased English or Arabic supplier name → supplier id (active suppliers only) */
  suppliers: ReadonlyMap<string, string>;
  /** `categoryKey(name)` of every category's English and Arabic name → category id */
  categories: ReadonlyMap<string, string>;
  /** ids of hidden categories: not for new links (PU2), but a product may keep one it has */
  inactiveCategoryIds?: ReadonlySet<string>;
};

const MAX_TEXT = 200;
const CODE = /^[A-Z0-9._\-/]+$/;

export function validateProductImport(sheet: ParsedSheet, ctx: ProductImportContext): ProductImportResult {
  const fileErrors: string[] = [];
  if (!sheet.headers.includes("modelcode")) fileErrors.push("import.errors.missingModelCode");
  if (sheet.rows.length === 0) fileErrors.push("import.errors.empty");
  if (fileErrors.length) return { fileErrors, rows: [], counts: { create: 0, update: 0, error: 0 }, newCategories: [] };
  const newCategories = new Map<string, string>(); // key → name as first written

  // Who owns each SKU / barcode in the database (another product's code may not be reused).
  const skuOwner = new Map<string, string>();
  const barcodeOwner = new Map<string, string>();
  for (const [modelCode, p] of ctx.products) {
    skuOwner.set(p.sku, modelCode);
    if (p.barcode) barcodeOwner.set(p.barcode, modelCode);
  }

  const seen = new Map<string, number>();
  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();
  const rows = sheet.rows.map(({ row, values }): ProductImportRow => {
    const errors: RowError[] = [];
    const get = (k: string) => (values[k] ?? "").trim();
    const modelCode = normalizeModelCode(get("modelcode"));
    const isUpdate = ctx.products.has(modelCode);
    const data: ProductImportData = { modelCode };

    if (!modelCode) errors.push({ field: "modelCode", key: "validation.required" });
    else if (modelCode.length > 50) errors.push({ field: "modelCode", key: "validation.tooLong" });
    else if (seen.has(modelCode)) errors.push({ field: "modelCode", key: "import.errors.duplicateInFile" });
    if (modelCode) seen.set(modelCode, row);

    const text = (field: keyof ProductImportData, key: string, max = MAX_TEXT, required = false) => {
      const v = get(key);
      if (v) {
        if (v.length > max) errors.push({ field, key: "validation.tooLong" });
        else (data as Record<string, unknown>)[field] = v;
      } else if (required && !isUpdate) errors.push({ field, key: "validation.required" });
    };
    const whole = (field: keyof ProductImportData, key: string) => {
      const v = get(key);
      if (!v) return;
      const parsed = parseWholeNumber(v);
      if (parsed === null) errors.push({ field, key: "validation.wholeNumber" });
      else (data as Record<string, unknown>)[field] = parsed;
    };
    const money = (field: keyof ProductImportData, key: string) => {
      const v = get(key);
      if (!v) return;
      const parsed = parseMoney(v);
      if (parsed === null) errors.push({ field, key: "validation.money" });
      else (data as Record<string, unknown>)[field] = parsed;
    };
    /** SKU / barcode: valid characters, not in the file twice, not another product's. */
    const code = (field: "sku" | "barcode", value: string, owner: Map<string, string>, seenSet: Set<string>) => {
      if (value.length > 64 || !CODE.test(value)) return errors.push({ field, key: "validation.code" });
      if (seenSet.has(value)) return errors.push({ field, key: "import.errors.duplicateInFile" });
      seenSet.add(value);
      const ownedBy = owner.get(value);
      if (ownedBy && ownedBy !== modelCode) return errors.push({ field, key: field === "sku" ? "products.errors.skuTaken" : "products.errors.barcodeTaken" });
      data[field] = value;
    };

    const skuText = toWesternDigits(get("sku")).toUpperCase();
    // A new product without a SKU gets its model code as SKU — which must be free too.
    if (skuText) code("sku", skuText, skuOwner, seenSku);
    else if (!isUpdate && modelCode) code("sku", modelCode, skuOwner, seenSku);
    const barcodeText = toWesternDigits(get("barcode")).toUpperCase();
    if (barcodeText) code("barcode", barcodeText, barcodeOwner, seenBarcode);

    text("nameEn", "nameen", MAX_TEXT, true);
    text("nameAr", "namear", MAX_TEXT, true);

    const names = splitCategoryCell(get("category"));
    if (names.length > MAX_PRODUCT_CATEGORIES) errors.push({ field: "category", key: "products.errors.tooManyCategories" });
    else if (names.some((n) => n.length > 100)) errors.push({ field: "category", key: "validation.tooLong" });
    else if (names.length) {
      const ids: string[] = [];
      for (const n of names) {
        const id = ctx.categories.get(categoryKey(n)) ?? `${NEW_CATEGORY}${categoryKey(n)}`;
        if (!ids.includes(id)) ids.push(id);
        if (id.startsWith(NEW_CATEGORY) && !newCategories.has(categoryKey(n))) newCategories.set(categoryKey(n), n);
      }
      const own = ctx.products.get(modelCode)?.categoryIds ?? [];
      if (ids.some((id) => ctx.inactiveCategoryIds?.has(id) && !own.includes(id))) {
        errors.push({ field: "category", key: "import.errors.hiddenCategory" });
      } else data.categoryIds = ids;
    } else if (!isUpdate) errors.push({ field: "category", key: "validation.required" });

    text("sizeRange", "sizerange", 50);
    text("colour", "colour", 50);
    whole("maxLoadKg", "maxloadkg");
    text("vesa", "vesa", 50);
    text("variant", "variant");

    const imageUrl = get("imageurl");
    if (imageUrl) {
      if (isHttpUrl(imageUrl)) data.imageUrl = imageUrl;
      else errors.push({ field: "imageUrl", key: "validation.url" });
    }

    money("cost", "cost");
    money("sellingPrice", "sellingprice");
    whole("lowStockLevel", "lowstocklevel");
    whole("leadTimeDays", "leadtimedays");
    whole("wooProductId", "wooproductid");
    text("wooSku", "woosku", 100);

    const supplier = get("supplier");
    if (supplier) {
      const id = ctx.suppliers.get(supplier.toLowerCase());
      if (id) data.defaultSupplierId = id;
      else errors.push({ field: "supplier", key: "import.errors.unknownSupplier" });
    }

    return { row, modelCode, action: errors.length ? "error" : isUpdate ? "update" : "create", errors, data };
  });

  const counts = { create: 0, update: 0, error: 0 };
  for (const r of rows) counts[r.action]++;
  // Only categories of rows that will be saved are created.
  const used = new Set(
    rows
      .filter((r) => r.action !== "error")
      .flatMap((r) => r.data.categoryIds ?? [])
      .filter((id) => id.startsWith(NEW_CATEGORY))
      .map((id) => id.slice(NEW_CATEGORY.length)),
  );
  return { fileErrors, rows, counts, newCategories: [...newCategories].filter(([k]) => used.has(k)).map(([, name]) => name) };
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

