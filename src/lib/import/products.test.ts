import { describe, expect, it } from "vitest";
import { sheetFromMatrix } from "./sheet";
import { validateProductImport } from "./products";

const HEAD = ["modelCode", "nameEn", "nameAr", "category", "variant", "imageUrl", "cost", "lowStockLevel"];
const ctx = (existing: string[] = []) => ({
  products: new Map(existing.map((m) => [m, { sku: m, barcode: null }])),
  suppliers: new Map([["acme trading", "sup1"], ["أكمي", "sup1"]]),
  categories: new Map([
    ["wall-mount", "cat-wall-mount"],
    ["tv wall mounts", "cat-wall-mount"],
    ["tv tables", "cat-tv-table"],
    ["طاولات تلفزيون", "cat-tv-table"],
  ]),
});
const run = (rows: string[][], existing: string[] = []) => validateProductImport(sheetFromMatrix([HEAD, ...rows]), ctx(existing));

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
      sku: "HMD-900",
      nameEn: "Mount",
      nameAr: "حامل",
      categoryIds: ["cat-wall-mount"],
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

  it("accepts several categories by English or Arabic name; unknown names become new categories (PU4)", () => {
    const r = run([
      ["A-1", "x", "س", "tv TABLES, TV wall mounts", "", "", "", ""],
      ["A-2", "x", "س", "طاولات تلفزيون، Chairs", "", "", "", ""],
      ["A-3", "x", "س", "chairs; Shelves", "", "", "", ""],
      ["A-4", "", "", "Desks", "", "", "", ""], // error row: its new category isn't created
    ]);
    expect(r.rows[0].data.categoryIds).toEqual(["cat-tv-table", "cat-wall-mount"]);
    expect(r.rows[1].data.categoryIds).toEqual(["cat-tv-table", "new:chairs"]);
    expect(r.rows[2].data.categoryIds).toEqual(["new:chairs", "new:shelves"]);
    expect(r.newCategories).toEqual(["Chairs", "Shelves"]);
    expect(run([["A-5", "x", "س", "a,b,c,d,e,f,g,h,i,j,k", "", "", "", ""]]).rows[0].errors).toEqual([
      { field: "category", key: "products.errors.tooManyCategories" },
    ]);
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
    expect(r.rows[1].errors).toContainEqual({ field: "modelCode", key: "import.errors.duplicateInFile" });
  });

  it("reports a missing modelCode column or empty file", () => {
    expect(validateProductImport(sheetFromMatrix([["name"], ["x"]]), ctx()).fileErrors).toEqual([
      "import.errors.missingModelCode",
    ]);
    expect(validateProductImport(sheetFromMatrix([HEAD]), ctx()).fileErrors).toEqual(["import.errors.empty"]);
  });

  it("checks SKU and barcode against the file and the database, and finds suppliers by name", () => {
    const head = ["modelCode", "nameEn", "nameAr", "category", "sku", "barcode", "supplier", "sellingPrice", "maxLoadKg"];
    const c = { products: new Map([["OLD-1", { sku: "SKU-OLD", barcode: "6281234" }]]), suppliers: ctx().suppliers, categories: ctx().categories };
    const r = validateProductImport(
      sheetFromMatrix([
        head,
        ["N-1", "a", "ب", "wall-mount", "sku-1", "٦٢٨٩", "Acme Trading", "199.00", "45"],
        ["N-2", "a", "ب", "wall-mount", "SKU-1", "6281234", "Nobody", "x", "-3"],
        ["N-3", "a", "ب", "wall-mount", "SKU-OLD", "", "أكمي", "", ""],
        ["OLD-1", "", "", "", "SKU-OLD", "6281234", "", "", ""],
      ]),
      c,
    );
    expect(r.rows[0].data).toMatchObject({ sku: "SKU-1", barcode: "6289", defaultSupplierId: "sup1", sellingPrice: "199.00", maxLoadKg: 45 });
    expect(r.rows[1].errors).toEqual([
      { field: "sku", key: "import.errors.duplicateInFile" },
      { field: "barcode", key: "products.errors.barcodeTaken" },
      { field: "maxLoadKg", key: "validation.wholeNumber" },
      { field: "sellingPrice", key: "validation.money" },
      { field: "supplier", key: "import.errors.unknownSupplier" },
    ]);
    expect(r.rows[2].errors).toEqual([{ field: "sku", key: "products.errors.skuTaken" }]);
    // Its own SKU and barcode are fine — but they were already used by earlier rows of this file.
    expect(r.rows[3].errors).toEqual([
      { field: "sku", key: "import.errors.duplicateInFile" },
      { field: "barcode", key: "import.errors.duplicateInFile" },
    ]);
    const own = validateProductImport(sheetFromMatrix([head, ["OLD-1", "", "", "", "SKU-OLD", "6281234", "", "", ""]]), c);
    expect(own.rows[0].action).toBe("update");
  });
});
