import { describe, expect, it } from "vitest";
import { sheetFromMatrix } from "./sheet";
import { validateOpeningStock, type OpeningStockProduct } from "./opening-stock";

const products = new Map<string, OpeningStockProduct>([
  ["HMD-772", { id: "p1", modelCode: "HMD-772", nameEn: "Mount", nameAr: "حامل", active: true }],
  ["OLD-1", { id: "p2", modelCode: "OLD-1", nameEn: "Old", nameAr: "قديم", active: false }],
]);
const run = (rows: string[][]) => validateOpeningStock(sheetFromMatrix([["modelCode", "quantity"], ...rows]), products);

describe("validateOpeningStock", () => {
  it("accepts known active products with whole quantities", () => {
    const r = run([["hmd-772", "١٢"]]);
    expect(r.totals).toEqual({ lines: 1, units: 12, errors: 0 });
    expect(r.rows[0].product?.id).toBe("p1");
  });

  it("rejects unknown, inactive, duplicate and bad quantities", () => {
    const r = run([
      ["NOPE", "1"],
      ["OLD-1", "1"],
      ["HMD-772", "0"],
      ["HMD-772", "2.5"],
    ]);
    expect(r.rows.map((x) => x.errors.map((e) => e.key))).toEqual([
      ["import.errors.unknownProduct"],
      ["import.errors.inactiveProduct"],
      ["validation.positiveWhole"],
      ["import.errors.duplicateInFile", "validation.positiveWhole"],
    ]);
    expect(r.totals.errors).toBe(4);
  });

  it("needs both columns", () => {
    expect(validateOpeningStock(sheetFromMatrix([["modelCode"], ["HMD-772"]]), products).fileErrors).toEqual([
      "import.errors.missingQuantity",
    ]);
  });
});
