/**
 * Column matching for the product import (plans ui-menu-import-categories PU3, import-sku). Pure.
 * A file's header row → a suggested product field per column (English and Arabic names, common
 * synonyms, WooCommerce export headers); the user may change any of them; `applyMapping` then turns the
 * sheet into the canonical keys the validator reads.
 */
import { PRODUCT_IMPORT_COLUMNS } from "./products";
import type { ParsedSheet } from "./sheet";

export type ImportField = (typeof PRODUCT_IMPORT_COLUMNS)[number];
/** Column position (as text, JSON-friendly) → field, or "" to skip the column. */
export type ColumnMapping = Record<string, ImportField | "">;

/**
 * What the owner listed as the details that matter (plan import-sku): shown first and marked in the
 * column picker. Only a name is really needed — the SKU is given by the app, a missing category falls
 * back to the one chosen for the import, and the rest is optional.
 */
export const KEY_FIELDS: readonly ImportField[] = ["nameen", "sku", "category", "sellingprice", "stock", "imageurl"];
/** Columns that identify a product (a row needs one of them). */
export const IDENTITY_FIELDS: readonly ImportField[] = ["modelcode", "nameen", "namear", "sku"];

/**
 * Header names per field, strongest first (compared after `normalizeHeader`). Order matters between
 * fields too: the best-ranked match wins, each field takes one column.
 */
const SYNONYMS: Record<ImportField, string[]> = {
  modelcode: ["modelcode", "model", "modelno", "modelnumber", "itemcode", "productcode", "partno", "partnumber", "code", "itemno", "ref",
    "رقمالموديل", "الموديل", "موديل", "كودالمنتج", "رمزالمنتج", "رقمالصنف", "الكود", "كود"],
  sku: ["sku", "skucode", "stockcode", "internalcode", "رمزالتخزين"],
  barcode: ["barcode", "ean", "ean13", "upc", "gtin", "الباركود", "باركود"],
  nameen: ["nameen", "englishname", "nameenglish", "productnameen", "name", "productname", "product", "itemname", "item", "title",
    "الاسمبالانجليزي", "الاسمالانجليزي", "اسمانجليزي", "الاسمبالإنجليزي", "الاسمالإنجليزي"],
  namear: ["namear", "arabicname", "namearabic", "productnamear", "الاسمبالعربي", "الاسمالعربي", "اسمعربي", "اسمالمنتج", "الاسم", "اسم", "اسمالصنف"],
  category: ["category", "categories", "productcategory", "cat", "group", "الفئة", "الفئات", "فئة", "التصنيف", "تصنيف", "القسم"],
  sizerange: ["sizerange", "size", "screensize", "tvsize", "المقاس", "مقاس", "مقاسالشاشة", "الحجم"],
  colour: ["colour", "color", "اللون", "لون"],
  maxloadkg: ["maxloadkg", "maxload", "load", "maxweight", "weightcapacity", "capacity", "الحمولة", "الحمولةالقصوى", "أقصىوزن", "اقصىوزن"],
  vesa: ["vesa", "فيزا"],
  variant: ["variant", "otherdetails", "details", "option", "التفاصيل", "تفاصيل"],
  imageurl: ["imageurl", "image", "images", "imageurls", "imagelink", "productimage", "productimages", "photo", "photos", "picture", "pictures", "img",
    "الصورة", "الصور", "رابطالصورة", "صورة"],
  cost: ["cost", "costprice", "unitcost", "purchaseprice", "unitpurchaseprice", "defaultpurchaseprice", "buyprice", "التكلفة", "سعرالتكلفة", "سعرالشراء", "تكلفة"],
  sellingprice: ["sellingprice", "price", "unitsellingprice", "defaultsellingprice", "saleprice", "retailprice", "regularprice", "productprice",
    "سعرالبيع", "السعر", "سعر"],
  stock: ["stock", "currentstock", "stockavailable", "availablestock", "available", "qty", "quantity", "onhand", "quantityonhand", "stockqty",
    "stockquantity", "inventory", "openingstock", "المخزون", "الكمية", "الرصيد", "المتوفر", "الكميةالمتوفرة"],
  warehouse: ["warehouse", "businesslocation", "location", "store", "branch", "المستودع", "المخزن", "الموقع", "الفرع"],
  lowstocklevel: ["lowstocklevel", "lowstock", "reorderlevel", "minstock", "minimumstock", "min", "حدالطلب", "الحدالأدنى", "الحدالادنى"],
  leadtimedays: ["leadtimedays", "leadtime", "deliverydays", "مدةالتوريد"],
  wooproductid: ["wooproductid", "woocommerceid", "wooid", "id"],
  woosku: ["woosku", "woocommercesku", "websitesku"],
  supplier: ["supplier", "suppliername", "vendor", "المورد", "اسمالمورد", "مورد"],
};

/** Header text → comparable form: lower-case, letters and digits only (any script). "Model No." → "modelno". */
export function normalizeHeader(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "") // Arabic diacritics and tatweel
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Mostly Arabic text in these cells (more Arabic letters than Latin ones in most of them)? */
function mostlyArabic(samples: readonly string[]): boolean {
  const filled = samples.filter((s) => s.trim());
  if (!filled.length) return false;
  const arabic = filled.filter((s) => (s.match(/[\u0600-\u06FF]/g)?.length ?? 0) > (s.match(/[A-Za-z]/g)?.length ?? 0));
  return arabic.length / filled.length >= 0.6;
}

/**
 * Suggest a field for every column. `samples[i]` are a few cell values of column i (used to tell an
 * Arabic name column from an English one when the header is just "Name" / "الاسم").
 */
export function suggestMapping(labels: readonly string[], samples: readonly (readonly string[])[] = []): ColumnMapping {
  const candidates: { column: number; field: ImportField; rank: number }[] = [];
  labels.forEach((label, column) => {
    const key = normalizeHeader(label);
    if (!key) return;
    for (const field of PRODUCT_IMPORT_COLUMNS) {
      const rank = SYNONYMS[field].indexOf(key);
      if (rank >= 0) candidates.push({ column, field, rank });
    }
  });
  candidates.sort((a, b) => a.rank - b.rank || a.column - b.column);

  const mapping: ColumnMapping = Object.fromEntries(labels.map((_, i) => [String(i), ""]));
  const taken = new Set<ImportField>();
  const usedColumns = new Set<number>();
  for (const c of candidates) {
    if (taken.has(c.field) || usedColumns.has(c.column)) continue;
    mapping[String(c.column)] = c.field;
    taken.add(c.field);
    usedColumns.add(c.column);
  }

  // A "Name" column full of Arabic is the Arabic name.
  for (const [col, field] of Object.entries(mapping)) {
    if (field === "nameen" && !taken.has("namear") && mostlyArabic(samples[Number(col)] ?? [])) {
      mapping[col] = "namear";
      taken.delete("nameen");
      taken.add("namear");
    }
  }
  return mapping;
}

/**
 * Problems with a mapping the user chose: a field picked twice; no column that identifies a product
 * (blocks); no name column (new products can't be created — a warning, updates still work).
 */
export function mappingProblems(mapping: ColumnMapping): { duplicates: ImportField[]; noIdentity: boolean; noName: boolean } {
  const count = new Map<ImportField, number>();
  for (const f of Object.values(mapping)) if (f) count.set(f, (count.get(f) ?? 0) + 1);
  return {
    duplicates: [...count].filter(([, n]) => n > 1).map(([f]) => f),
    noIdentity: !IDENTITY_FIELDS.some((f) => count.has(f)),
    noName: !count.has("nameen") && !count.has("namear"),
  };
}

/** The sheet with only the mapped columns, keyed by field (what `validateProductImport` reads). */
export function applyMapping(sheet: ParsedSheet, mapping: ColumnMapping): ParsedSheet {
  const columns = Object.entries(mapping)
    .filter((e): e is [string, ImportField] => Boolean(e[1]))
    .map(([col, field]) => ({ index: Number(col), field }));
  return {
    headers: columns.map((c) => c.field),
    labels: sheet.labels,
    rows: sheet.rows.map((r) => ({
      row: r.row,
      cells: r.cells,
      values: Object.fromEntries(columns.map((c) => [c.field, r.cells[c.index] ?? ""])),
    })),
  };
}
