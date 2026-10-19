/**
 * Product import validation. Pure: takes the mapped rows + what the database holds, returns a verdict
 * per row and per product.
 * - v1 Q8: an empty cell keeps the existing value; the import never changes the product status.
 * - Plan ui-menu-import-categories PU4: several categories per cell; unknown names are created.
 * - Plan import-sku: the app gives the SKU (PS1); one name is enough (PS2); rows with the same model code
 *   are merged (PS3); stock becomes opening stock per warehouse for new products (PS4); categories are
 *   matched loosely, rows without one get the chosen default (PS5); prices/stock are cleaned (PS6).
 */
import { categoryKey, categoryMatchKey, MAX_PRODUCT_CATEGORIES, splitCategoryCell, tidyCategoryName } from "@/lib/categories";
import { normalizeModelCode, parseMoneyCell, parseStockCell, parseWholeNumber, toWesternDigits } from "./normalize";
import type { ParsedSheet } from "./sheet";

/** Every field a column can be matched to, in the order the column picker lists them. */
export const PRODUCT_IMPORT_COLUMNS = [
  "nameen",
  "namear",
  "modelcode",
  "sku",
  "category",
  "sellingprice",
  "stock",
  "warehouse",
  "imageurl",
  "cost",
  "barcode",
  "sizerange",
  "colour",
  "maxloadkg",
  "vesa",
  "variant",
  "lowstocklevel",
  "leadtimedays",
  "wooproductid",
  "woosku",
  "supplier",
] as const;

/** Header names of the template (the import also accepts any other spelling it recognises). */
export const PRODUCT_TEMPLATE_HEADERS = [
  "Product name",
  "Arabic name",
  "Model code",
  "SKU",
  "Category",
  "Selling price",
  "Stock",
  "Warehouse",
  "Image",
  "Cost",
  "Barcode",
  "Size range",
  "Colour",
  "Max load kg",
  "VESA",
  "Other details",
  "Low stock level",
  "Lead time days",
  "Woo product ID",
  "Woo SKU",
  "Supplier",
] as const;

export type ProductImportData = {
  modelCode: string;
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
  /** Units per warehouse label as written in the file ("" = no warehouse column). New products only. */
  stock?: { location: string; quantity: number }[];
};

/** Prefix of a category that the import will create (`new:<categoryKey>`). */
export const NEW_CATEGORY = "new:";

export type RowError = { field: string; key: string };

export type ProductImportRow = {
  row: number;
  modelCode: string;
  /** merged = this row adds to the product of an earlier row with the same model code (`mergedInto`). */
  action: "create" | "update" | "merged" | "error";
  errors: RowError[];
  /** Saved anyway, but worth a look (a different price in a merged row, stock not changed, …). */
  warnings: RowError[];
  mergedInto?: number;
  /** The whole product (after merging) on its first row; only this row's own values on merged rows. */
  data: ProductImportData;
};

export type ProductImportResult = {
  /** File-level problems (no column that identifies a product, empty file). */
  fileErrors: string[];
  rows: ProductImportRow[];
  counts: { create: number; update: number; merged: number; error: number };
  /** Rows left out because they are not products (the old software's footer). */
  ignoredRows: number;
  /** Category names that don't exist yet and will be created, as first written in the file (tidied). */
  newCategories: string[];
  /** New products that got the default category. */
  defaulted: number;
  /** Where stock goes: each warehouse label of the file, with the new products and units it holds. */
  locations: { label: string; products: number; units: number }[];
};

/** What the database already holds, plus the user's choices, for the lookups. */
export type ProductImportContext = {
  /** model code → its barcode and categories */
  products: ReadonlyMap<string, { sku?: string; barcode: string | null; categoryIds?: readonly string[] }>;
  /** existing SKU (upper case) → model code — a SKU column only finds existing products (PS6) */
  skus?: ReadonlyMap<string, string>;
  /** lower-cased English or Arabic supplier name → supplier id (active suppliers only) */
  suppliers: ReadonlyMap<string, string>;
  /** `categoryKey` and `categoryMatchKey` of every category's English and Arabic name → category id */
  categories: ReadonlyMap<string, string>;
  /** ids of hidden categories: not for new links (PU2), but a product may keep one it has */
  inactiveCategoryIds?: ReadonlySet<string>;
  /** For new products without a category: a category id, or a name to create ("Other"); null = required. */
  defaultCategory?: { id: string } | { name: string } | null;
};

const MAX_TEXT = 200;
const CODE = /^[A-Z0-9._\-/]+$/;
const EMPTY_COUNTS = { create: 0, update: 0, merged: 0, error: 0 };

/** A row whose filled cells all hold the same text is a footer/label row, not a product (PS6). */
function isJunkRow(cells: readonly string[]): boolean {
  const filled = cells.map((c) => c.replace(/ /g, " ").trim()).filter(Boolean);
  return filled.length >= 3 && filled.every((c) => c === filled[0]);
}

/** Values compared for "different in a merged row": case and spacing don't count ("Ham-144" = "ham-144"). */
function same(v: unknown): string {
  return String(v).replace(/\s+/g, " ").trim().toLowerCase();
}

/** "http://a/1.jpg, http://a/2.jpg" → the first link (a product has one main photo). */
function firstUrl(text: string): string {
  return text.split(/[\s,|]+/).find(Boolean) ?? "";
}

export function validateProductImport(sheet: ParsedSheet, ctx: ProductImportContext): ProductImportResult {
  const fileErrors: string[] = [];
  const has = (f: string) => sheet.headers.includes(f);
  if (!has("modelcode") && !has("nameen") && !has("namear") && !has("sku")) fileErrors.push("import.errors.noIdentity");
  const rowsIn = sheet.rows.filter((r) => !isJunkRow(r.cells ?? Object.values(r.values)));
  const ignoredRows = sheet.rows.length - rowsIn.length;
  if (rowsIn.length === 0) fileErrors.push("import.errors.empty");
  const empty = { fileErrors, rows: [], counts: EMPTY_COUNTS, ignoredRows, newCategories: [], defaulted: 0, locations: [] };
  if (fileErrors.length) return empty;

  const newCategories = new Map<string, string>(); // categoryMatchKey → name to create
  const barcodeOwner = new Map<string, string>();
  for (const [modelCode, p] of ctx.products) if (p.barcode) barcodeOwner.set(p.barcode, modelCode);
  const seenBarcode = new Map<string, string>(); // barcode → model code in this file

  // Pass 1: every row on its own.
  const rows = rowsIn.map(({ row, values }): ProductImportRow => {
    const errors: RowError[] = [];
    const warnings: RowError[] = [];
    const get = (k: string) => (values[k] ?? "").replace(/ /g, " ").trim();
    const data = {} as ProductImportData;

    const name = get("nameen") || get("namear");
    // Identity: an existing SKU, else the model code, else the name (the old software's "Product").
    const skuText = toWesternDigits(get("sku")).toUpperCase();
    const bySku = skuText ? ctx.skus?.get(skuText) : undefined;
    const modelCode = bySku ?? normalizeModelCode(get("modelcode") || name);
    data.modelCode = modelCode;
    if (!modelCode) errors.push({ field: "modelCode", key: "validation.required" });
    else if (modelCode.length > 50) errors.push({ field: "modelCode", key: "validation.tooLong" });

    const text = (field: keyof ProductImportData, key: string, max = MAX_TEXT) => {
      const v = get(key);
      if (!v) return;
      if (v.length > max) errors.push({ field, key: "validation.tooLong" });
      else (data as Record<string, unknown>)[field] = v;
    };
    const whole = (field: keyof ProductImportData, key: string) => {
      const v = get(key);
      if (!v) return;
      const parsed = parseWholeNumber(v);
      if (parsed === null) errors.push({ field, key: "validation.wholeNumber" });
      else (data as Record<string, unknown>)[field] = parsed;
    };
    const money = (field: "cost" | "sellingPrice", key: string) => {
      const v = get(key);
      if (!v) return;
      const parsed = parseMoneyCell(v);
      if (parsed === null) errors.push({ field, key: "validation.money" });
      else data[field] = parsed;
    };

    text("nameEn", "nameen");
    text("nameAr", "namear");

    const barcode = toWesternDigits(get("barcode")).toUpperCase();
    if (barcode) {
      const owner = barcodeOwner.get(barcode);
      const inFile = seenBarcode.get(barcode);
      if (barcode.length > 64 || !CODE.test(barcode)) errors.push({ field: "barcode", key: "validation.code" });
      else if (owner && owner !== modelCode) errors.push({ field: "barcode", key: "products.errors.barcodeTaken" });
      else if (inFile && inFile !== modelCode) errors.push({ field: "barcode", key: "import.errors.duplicateInFile" });
      else {
        seenBarcode.set(barcode, modelCode);
        data.barcode = barcode;
      }
    }

    const names = splitCategoryCell(get("category"));
    if (names.length > MAX_PRODUCT_CATEGORIES) errors.push({ field: "category", key: "products.errors.tooManyCategories" });
    else if (names.some((n) => n.length > 100)) errors.push({ field: "category", key: "validation.tooLong" });
    else if (names.length) {
      const ids: string[] = [];
      for (const n of names) {
        // New names are keyed loosely too, so "WALL MOUNT" and "Wall mounts" make one new category (PS5).
        const id = ctx.categories.get(categoryKey(n)) ?? ctx.categories.get(categoryMatchKey(n)) ?? `${NEW_CATEGORY}${categoryMatchKey(n)}`;
        if (!ids.includes(id)) ids.push(id);
        if (id.startsWith(NEW_CATEGORY) && !newCategories.has(categoryMatchKey(n))) newCategories.set(categoryMatchKey(n), tidyCategoryName(n));
      }
      const own = ctx.products.get(modelCode)?.categoryIds ?? [];
      if (ids.some((id) => ctx.inactiveCategoryIds?.has(id) && !own.includes(id))) {
        errors.push({ field: "category", key: "import.errors.hiddenCategory" });
      } else data.categoryIds = ids;
    }

    text("sizeRange", "sizerange", 50);
    text("colour", "colour", 50);
    whole("maxLoadKg", "maxloadkg");
    text("vesa", "vesa", 50);
    text("variant", "variant");

    const imageUrl = firstUrl(get("imageurl"));
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

    const stockText = get("stock");
    if (stockText) {
      const qty = parseStockCell(stockText);
      // Old systems often show negative stock (sold before it was received): it counts as none (PS6).
      if (qty === "negative") warnings.push({ field: "stock", key: "import.warnings.negativeStock" });
      else if (qty === null || qty === "fraction") errors.push({ field: "stock", key: "validation.wholeNumber" });
      else if (qty > 0) {
        const places = get("warehouse").split(/[,،;]/).map((p) => p.trim()).filter(Boolean);
        if (places.length > 1) warnings.push({ field: "warehouse", key: "import.warnings.severalWarehouses" });
        data.stock = [{ location: places[0] ?? "", quantity: qty }];
      }
    }

    return { row, modelCode, action: errors.length ? "error" : "create", errors, warnings, data };
  });

  // Pass 2: one product per model code (PS3). The first row carries the product; later rows add their
  // stock and categories and fill empty fields; a different value is a warning, the first one is kept.
  const first = new Map<string, ProductImportRow>();
  for (const r of rows) {
    if (!r.modelCode) continue;
    const head = first.get(r.modelCode);
    if (!head) {
      first.set(r.modelCode, r);
      continue;
    }
    r.mergedInto = head.row;
    if (r.action === "error") continue;
    r.action = "merged";
    if (head.action === "error") continue;
    const into = head.data as Record<string, unknown>;
    for (const [k, v] of Object.entries(r.data) as [keyof ProductImportData, unknown][]) {
      if (k === "modelCode" || k === "stock" || k === "categoryIds" || v === undefined) continue;
      if (into[k] === undefined) into[k] = v;
      else if (same(into[k]) !== same(v)) r.warnings.push({ field: k, key: "import.warnings.differentValue" });
    }
    if (r.data.categoryIds?.length) {
      const ids = (head.data.categoryIds ??= []);
      for (const id of r.data.categoryIds) {
        if (ids.includes(id)) continue;
        if (ids.length < MAX_PRODUCT_CATEGORIES) ids.push(id);
        else if (!r.warnings.some((w) => w.field === "category")) r.warnings.push({ field: "category", key: "import.warnings.tooManyCategories" });
      }
    }
    if (r.data.stock?.length) (head.data.stock ??= []).push(...r.data.stock);
  }

  // Pass 3: per product — create or update, the name and category a new product needs, stock rules.
  let defaulted = 0;
  for (const head of first.values()) {
    if (head.action === "error") continue;
    const isUpdate = ctx.products.has(head.modelCode);
    head.action = isUpdate ? "update" : "create";
    if (isUpdate) {
      if (head.data.stock?.length) {
        head.warnings.push({ field: "stock", key: "import.warnings.stockNotChanged" });
        delete head.data.stock;
      }
      continue;
    }
    // One name is enough (PS2) — for a new product only; on an update an Arabic-only file leaves nameEn alone.
    if (!head.data.nameEn && head.data.nameAr) head.data.nameEn = head.data.nameAr;
    if (!head.data.nameEn) head.errors.push({ field: "nameEn", key: "validation.required" });
    if (!head.data.categoryIds?.length) {
      const d = ctx.defaultCategory;
      if (!d) head.errors.push({ field: "category", key: "validation.required" });
      else {
        defaulted++;
        if ("id" in d) head.data.categoryIds = [d.id];
        else {
          head.data.categoryIds = [`${NEW_CATEGORY}${categoryMatchKey(d.name)}`];
          if (!newCategories.has(categoryMatchKey(d.name))) newCategories.set(categoryMatchKey(d.name), d.name);
        }
      }
    }
    if (head.errors.length) head.action = "error";
  }

  const counts = { ...EMPTY_COUNTS };
  for (const r of rows) counts[r.action]++;
  const saved = [...first.values()].filter((r) => r.action !== "error");

  // Only categories of products that will be saved are created.
  const used = new Set(
    saved
      .flatMap((r) => r.data.categoryIds ?? [])
      .filter((id) => id.startsWith(NEW_CATEGORY))
      .map((id) => id.slice(NEW_CATEGORY.length)),
  );

  // Stock of new products per warehouse label, combining rows of one product in one place.
  const byLocation = new Map<string, { products: Set<string>; units: number }>();
  for (const r of saved) {
    for (const s of r.data.stock ?? []) {
      const l = byLocation.get(s.location) ?? byLocation.set(s.location, { products: new Set(), units: 0 }).get(s.location)!;
      l.products.add(r.modelCode);
      l.units += s.quantity;
    }
  }

  return {
    fileErrors,
    rows,
    counts,
    ignoredRows,
    newCategories: [...newCategories].filter(([k]) => used.has(k)).map(([, name]) => name),
    defaulted,
    locations: [...byLocation].map(([label, l]) => ({ label, products: l.products.size, units: l.units })),
  };
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
