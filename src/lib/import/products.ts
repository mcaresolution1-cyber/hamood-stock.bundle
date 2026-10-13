/**
 * Product import validation. Pure: takes parsed rows + what the database holds, returns a per-row verdict.
 * Decisions (docs/plans/v1.md): Q8 — an empty cell keeps the existing value and import never changes
 * the product status; Q9 — fixed categories, accepted as key or English/Arabic label.
 * Phase B: SKU / barcode must be unique (file + database), supplier given by its English or Arabic name.
 */
import { CATEGORIES, categoryFromText } from "@/lib/products";
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
  category?: string;
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

/** What the database already holds, for the duplicate and lookup checks. */
export type ProductImportContext = {
  /** model code → its current SKU and barcode */
  products: ReadonlyMap<string, { sku: string; barcode: string | null }>;
  /** lower-cased English or Arabic supplier name → supplier id (active suppliers only) */
  suppliers: ReadonlyMap<string, string>;
};

const MAX_TEXT = 200;
const CODE = /^[A-Z0-9._\-/]+$/;

export function validateProductImport(sheet: ParsedSheet, ctx: ProductImportContext): ProductImportResult {
  const fileErrors: string[] = [];
  if (!sheet.headers.includes("modelcode")) fileErrors.push("import.errors.missingModelCode");
  if (sheet.rows.length === 0) fileErrors.push("import.errors.empty");
  if (fileErrors.length) return { fileErrors, rows: [], counts: { create: 0, update: 0, error: 0 } };

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

    const categoryText = get("category");
    if (categoryText) {
      const category = categoryFromText(categoryText);
      if (category) data.category = category;
      else errors.push({ field: "category", key: "import.errors.unknownCategory" });
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
