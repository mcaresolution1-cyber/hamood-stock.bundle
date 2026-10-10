import { describe, expect, it } from "vitest";
import { sheetFromMatrix } from "./sheet";
import { validateProductImport } from "./products";

const HEAD = ["modelCode", "nameEn", "nameAr", "category", "variant", "imageUrl", "cost", "lowStockLevel"];
const run = (rows: string[][], existing: string[] = []) =>
  validateProductImport(sheetFromMatrix([HEAD, ...rows]), new Set(existing));

describe("validateProductImport", () => {
  it("creates new products and updates existing ones by model code", () => {
    const r = run(
      [
        ["hmd-900", "Mount", "حامل", "wall-mount", "", "", "85", "4"],
        ["HMD-772", "", "", "", "", "", "99.50", ""],
      ],
      ["HMD-772"],
    );
    expect(r.counts).toEqual({ create: 1, update: 1, error: 0 });
    expect(r.rows[0].data).toEqual({
      modelCode: "HMD-900",
      nameEn: "Mount",
      nameAr: "حامل",
      category: "wall-mount",
      cost: "85",
      lowStockLevel: 4,
    });
    // Q8: empty cells are left out, so the update keeps existing values
    expect(r.rows[1].data).toEqual({ modelCode: "HMD-772", cost: "99.50" });
  });

  it("requires names and category only for new products", () => {
    const r = run([["NEW-1", "", "", "", "", "", "", ""]]);
    expect(r.rows[0].action).toBe("error");
    expect(r.rows[0].errors.map((e) => e.field).sort()).toEqual(["category", "nameAr", "nameEn"]);
  });

  it("accepts a category label in English or Arabic and rejects unknown ones", () => {
    const r = run([
      ["A-1", "x", "س", "TV tables", "", "", "", ""],
      ["A-2", "x", "س", "طاولات تلفزيون", "", "", "", ""],
      ["A-3", "x", "س", "chairs", "", "", "", ""],
    ]);
    expect(r.rows[0].data.category).toBe("tv-table");
    expect(r.rows[1].data.category).toBe("tv-table");
    expect(r.rows[2].errors).toEqual([{ field: "category", key: "import.errors.unknownCategory" }]);
  });

  it("reports bad cost, bad low-stock level and bad URL per field", () => {
    const r = run([["A-1", "x", "س", "wall-mount", "", "ftp://x", "12.345", "-1"]]);
    expect(r.rows[0].errors).toEqual([
      { field: "imageUrl", key: "validation.url" },
      { field: "cost", key: "validation.money" },
      { field: "lowStockLevel", key: "validation.wholeNumber" },
    ]);
  });

  it("flags a model code repeated in the file", () => {
    const r = run([
      ["A-1", "x", "س", "wall-mount", "", "", "", ""],
      ["a-1", "y", "ص", "wall-mount", "", "", "", ""],
    ]);
    expect(r.rows[0].action).toBe("create");
    expect(r.rows[1].errors).toEqual([{ field: "modelCode", key: "import.errors.duplicateInFile" }]);
  });

  it("reports a missing modelCode column or empty file", () => {
    expect(validateProductImport(sheetFromMatrix([["name"], ["x"]]), new Set()).fileErrors).toEqual([
      "import.errors.missingModelCode",
    ]);
    expect(validateProductImport(sheetFromMatrix([HEAD]), new Set()).fileErrors).toEqual(["import.errors.empty"]);
  });
});
