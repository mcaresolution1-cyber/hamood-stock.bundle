/**
 * Read + validate a product import file against the database. Server-only helper (NOT a server action:
 * callers check permissions first — the import actions and the error-file route).
 */
import "server-only";
import { db } from "@/lib/db";
import { validateProductImport, type ProductImportResult } from "@/lib/import/products";
import type { ParsedSheet } from "@/lib/import/sheet";
import { readSheet } from "./readSheet";

export async function validateImportFile(formData: FormData): Promise<{ sheet: ParsedSheet; result: ProductImportResult }> {
  const sheet = await readSheet(formData.get("file"));
  return { sheet, result: validateProductImport(sheet, await importContext()) };
}

async function importContext() {
  const [products, suppliers] = await Promise.all([
    db.product.findMany({ select: { modelCode: true, sku: true, barcode: true } }),
    db.supplier.findMany({ where: { active: true }, select: { id: true, nameEn: true, nameAr: true } }),
  ]);
  const supplierByName = new Map<string, string>();
  for (const s of suppliers) {
    supplierByName.set(s.nameEn.toLowerCase(), s.id);
    if (s.nameAr) supplierByName.set(s.nameAr.toLowerCase(), s.id);
  }
  return { products: new Map(products.map((p) => [p.modelCode, { sku: p.sku, barcode: p.barcode }])), suppliers: supplierByName };
}

