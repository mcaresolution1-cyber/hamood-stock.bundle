import { z } from "zod";
import { PRODUCT_STATUSES } from "@/lib/products";
import { MAX_PRODUCT_CATEGORIES } from "@/lib/categories";
import { toWesternDigits } from "@/lib/import/normalize";
import {
  modelCode,
  moneyText,
  optionalText,
  optionalUrl,
  optionalWholeNumberText,
  requiredText,
  wholeNumberText,
} from "./common";

/** SKU / barcode: letters, digits, dot, dash, underscore, slash (Western digits). Empty = null. */
const code = (max: number) =>
  z
    .string()
    .transform((v) => toWesternDigits(v).trim().toUpperCase())
    .refine((v) => v === "" || (v.length <= max && /^[A-Z0-9._\-/]+$/.test(v)), "validation.code")
    .transform((v) => (v === "" ? null : v));

/** One row of the per-warehouse reorder table. Rows with an empty level are dropped (no override). */
const reorderRow = z.object({
  warehouseId: z.string().min(1).max(64),
  reorderLevel: optionalWholeNumberText,
  reorderQty: optionalWholeNumberText,
});

export const productSchema = z.object({
  modelCode,
  /** Empty → the model code (decision in docs/plans/v2.md, Phase B). */
  sku: code(64),
  barcode: code(64),
  nameEn: requiredText(200),
  nameAr: requiredText(200),
  /** One or more categories, the main one first (PU2). */
  categoryIds: z
    .array(z.string().min(1).max(64))
    .min(1, "products.errors.categoryRequired")
    .max(MAX_PRODUCT_CATEGORIES, "products.errors.tooManyCategories")
    .refine((ids) => new Set(ids).size === ids.length, "errors.invalidInput"),
  status: z.enum(PRODUCT_STATUSES, { message: "validation.required" }),
  variant: optionalText(200),
  sizeRange: optionalText(50),
  colour: optionalText(50),
  maxLoadKg: optionalWholeNumberText,
  vesa: optionalText(50),
  imageUrl: optionalUrl,
  cost: moneyText,
  sellingPrice: moneyText,
  lowStockLevel: wholeNumberText,
  leadTimeDays: optionalWholeNumberText,
  wooProductId: optionalWholeNumberText,
  wooSku: optionalText(100),
  defaultSupplierId: z.string().max(64).transform((v) => (v === "" ? null : v)),
  reorder: z
    .array(reorderRow)
    .max(100)
    .transform((rows) =>
      rows
        .filter((r) => r.reorderLevel !== null)
        .map((r) => ({ warehouseId: r.warehouseId, reorderLevel: r.reorderLevel as number, reorderQty: r.reorderQty ?? 0 })),
    ),
});

export type ProductFormValues = z.input<typeof productSchema>;
export type ProductInput = z.output<typeof productSchema>;

/** The Product table columns of a parsed form (reorder rows are saved separately). */
export function productColumns(p: ProductInput) {
  const { reorder: _reorder, categoryIds: _categoryIds, ...columns } = p;
  void _reorder;
  void _categoryIds;
  return { ...columns, sku: p.sku ?? p.modelCode, imageId: imageIdFrom(p.imageUrl) };
}

/** "/api/product-images/<id>" → "<id>", anything else → null. */
export function imageIdFrom(url: string | null): string | null {
  const m = url?.match(/^\/api\/product-images\/([a-z0-9]{10,40})$/);
  return m ? m[1] : null;
}
