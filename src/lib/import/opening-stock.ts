/**
 * Opening stock file validation (columns: modelCode, quantity). Pure.
 * Model codes must exist and be active (Q7: inactive products can't come in).
 */
import { normalizeModelCode, parseWholeNumber } from "./normalize";
import type { ParsedSheet } from "./sheet";
import type { RowError } from "./products";

export type OpeningStockProduct = { id: string; modelCode: string; nameEn: string; nameAr: string; active: boolean };

export type OpeningStockRow = {
  row: number;
  modelCode: string;
  quantity: number | null;
  product: { id: string; nameEn: string; nameAr: string } | null;
  errors: RowError[];
};

export type OpeningStockResult = {
  fileErrors: string[];
  rows: OpeningStockRow[];
  totals: { lines: number; units: number; errors: number };
};

export function validateOpeningStock(
  sheet: ParsedSheet,
  products: ReadonlyMap<string, OpeningStockProduct>,
): OpeningStockResult {
  const fileErrors: string[] = [];
  if (!sheet.headers.includes("modelcode")) fileErrors.push("import.errors.missingModelCode");
  if (!sheet.headers.includes("quantity")) fileErrors.push("import.errors.missingQuantity");
  if (sheet.rows.length === 0) fileErrors.push("import.errors.empty");
  if (fileErrors.length) return { fileErrors, rows: [], totals: { lines: 0, units: 0, errors: 0 } };

  const seen = new Set<string>();
  const rows = sheet.rows.map(({ row, values }): OpeningStockRow => {
    const errors: RowError[] = [];
    const modelCode = normalizeModelCode(values.modelcode ?? "");
    const product = products.get(modelCode);

    if (!modelCode) errors.push({ field: "modelCode", key: "validation.required" });
    else if (!product) errors.push({ field: "modelCode", key: "import.errors.unknownProduct" });
    else if (!product.active) errors.push({ field: "modelCode", key: "import.errors.inactiveProduct" });
    if (modelCode && seen.has(modelCode)) errors.push({ field: "modelCode", key: "import.errors.duplicateInFile" });
    if (modelCode) seen.add(modelCode);

    const quantity = parseWholeNumber(values.quantity ?? "");
    if (quantity === null || quantity < 1) errors.push({ field: "quantity", key: "validation.positiveWhole" });
    else if (quantity > 100_000) errors.push({ field: "quantity", key: "validation.tooLarge" });

    return {
      row,
      modelCode,
      quantity,
      product: product ? { id: product.id, nameEn: product.nameEn, nameAr: product.nameAr } : null,
      errors,
    };
  });

  const valid = rows.filter((r) => r.errors.length === 0);
  return {
    fileErrors,
    rows,
    totals: {
      lines: valid.length,
      units: valid.reduce((s, r) => s + (r.quantity ?? 0), 0),
      errors: rows.length - valid.length,
    },
  };
}
