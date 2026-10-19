import { describe, expect, it } from "vitest";
import { sheetFromMatrix } from "./sheet";
import { applyMapping, suggestMapping } from "./columns";
import { validateProductImport, type ProductImportContext } from "./products";

/** Template-style headers are matched exactly by suggestMapping, like the app does before validating. */
const HEAD = ["modelCode", "nameEn", "nameAr", "category", "variant", "imageUrl", "cost", "lowStockLevel"];
const ctx = (existing: string[] = [], extra: Partial<ProductImportContext> = {}): ProductImportContext => ({
  products: new Map(existing.map((m) => [m, { sku: `HMD0000${m.length}`, barcode: null, categoryIds: ["cat-wall-mount"] }])),
  skus: new Map([["HMD00042", "HMD-772"]]),
  suppliers: new Map([["acme trading", "sup1"], ["أكمي", "sup1"]]),
  categories: new Map([
    ["wall-mount", "cat-wall-mount"],
    ["tv wall mounts", "cat-wall-mount"],
    ["wall mount", "cat-wall-mount"], // the loose key the server adds (categoryMatchKey)
    ["tv tables", "cat-tv-table"],
    ["table", "cat-tv-table"],
    ["طاولات تلفزيون", "cat-tv-table"],
    ["floor stand", "cat-floor-stand"],
  ]),
  defaultCategory: { name: "Other" },
  ...extra,
});
const validate = (matrix: (string | number)[][], c: ProductImportContext) => {
  const sheet = sheetFromMatrix(matrix.map((r) => r.map(String)));
  return validateProductImport(applyMapping(sheet, suggestMapping(sheet.labels ?? [])), c);
};
const run = (rows: string[][], existing: string[] = []) => validate([HEAD, ...rows], ctx(existing));

describe("validateProductImport", () => {
  it("creates new products and updates existing ones by model code; no SKU from the file (PS1)", () => {
    const r = run(
      [
        ["hmd-900", "Mount", "حامل", "wall-mount", "", "", "85", "4"],
        ["HMD-772", "", "", "", "", "", "99.50", ""],
      ],
      ["HMD-772"],
    );
    expect(r.counts).toEqual({ create: 1, update: 1, merged: 0, error: 0 });
    expect(r.rows[0].data).toEqual({
      modelCode: "HMD-900",
      nameEn: "Mount",
      nameAr: "حامل",
      categoryIds: ["cat-wall-mount"],
      cost: "85",
      lowStockLevel: 4,
    });
    // Q8: empty cells are left out, so the update keeps existing values
    expect(r.rows[1].data).toEqual({ modelCode: "HMD-772", cost: "99.50" });
  });

  it("needs only a name for a new product: the name is the model code, a missing category gets the default (PS2, PS5)", () => {
    const r = validate([["Product", "Selling Price"], ["Ham-114", "120"]], ctx());
    expect(r.rows[0]).toMatchObject({ action: "create", data: { modelCode: "HAM-114", nameEn: "Ham-114", categoryIds: ["new:other"], sellingPrice: "120" } });
    expect(r).toMatchObject({ defaulted: 1, newCategories: ["Other"] });
    const chosen = validate([["Product"], ["Ham-114"]], ctx([], { defaultCategory: { id: "cat-tv-table" } }));
    expect(chosen.rows[0].data.categoryIds).toEqual(["cat-tv-table"]);
    const none = validate([["Product"], ["Ham-114"]], ctx([], { defaultCategory: null }));
    expect(none.rows[0].errors).toEqual([{ field: "category", key: "validation.required" }]);
    // a model code without any name can only update
    expect(validate([["Model"], ["NEW-1"]], ctx()).rows[0].errors).toEqual([{ field: "nameEn", key: "validation.required" }]);
  });

  it("matches categories loosely and creates the rest with a tidy name (PS5)", () => {
    const r = run([
      ["A-1", "x", "", "WALL MOUNT, FLOOR STAND", "", "", "", ""],
      ["A-2", "x", "", "طاولات تلفزيون، CEILING MOUNT", "", "", "", ""],
      ["A-3", "", "", "Desks", "", "", "", ""], // error row (no name): its new category isn't created
    ]);
    expect(r.rows[0].data.categoryIds).toEqual(["cat-wall-mount", "cat-floor-stand"]);
    expect(r.rows[1].data.categoryIds).toEqual(["cat-tv-table", "new:ceiling mount"]);
    expect(r.newCategories).toEqual(["Ceiling Mount"]);
    expect(run([["A-5", "x", "", "a,b,c,d,e,f,g,h,i,j,k", "", "", "", ""]]).rows[0].errors).toEqual([
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

  it("merges rows of one model code: stock per warehouse, categories combined, first value kept with a warning (PS3)", () => {
    const r = validate(
      [
        ["Product", "Business Location", "Selling Price", "Current stock", "Category"],
        ["Ham-144", "WAREHOUSE A", "﷼ 250.00", "326.00 Pieces", "FLOOR STAND"],
        ["ham-144", "WAREHOUSE C", "﷼ 280.00", "2.00 Pieces", "WALL MOUNT"],
        ["Ham-144", "WAREHOUSE A", "﷼ 250.00", "4.00 Pieces", ""],
      ],
      ctx(),
    );
    expect(r.counts).toEqual({ create: 1, update: 0, merged: 2, error: 0 });
    expect(r.rows[0].data).toMatchObject({
      modelCode: "HAM-144",
      sellingPrice: "250.00",
      categoryIds: ["cat-floor-stand", "cat-wall-mount"],
      stock: [
        { location: "WAREHOUSE A", quantity: 326 },
        { location: "WAREHOUSE C", quantity: 2 },
        { location: "WAREHOUSE A", quantity: 4 },
      ],
    });
    expect(r.rows[1]).toMatchObject({ action: "merged", mergedInto: 2, warnings: [{ field: "sellingPrice", key: "import.warnings.differentValue" }] });
    expect(r.locations).toEqual([
      { label: "WAREHOUSE A", products: 1, units: 330 },
      { label: "WAREHOUSE C", products: 1, units: 2 },
    ]);
  });

  it("reads the old POS export: currency signs, units, several warehouses in a cell, its footer row (PS6)", () => {
    const footer = Array(6).fill("Add to location");
    const r = validate(
      [
        ["Action", "Product", "Business Location", "Unit Purchase Price", "Selling Price", "Current stock", "Category", "SKU"],
        ["View Edit", "0001 black", "WAREHOUSE A", "﷼ 500.00", "﷼ 1,500.00", "1,943.00 Pieces", "TABLETOP TV MOUNT", "0001 black1074"],
        ["View Edit", "Hmd-800", "WAREHOUSE B, WAREHOUSE C", "﷼ 10.00", "﷼ 20.00", "745.00 Pieces", "WALL MOUNT", "x"],
        ["View Edit", "Zero", "WAREHOUSE B", "﷼ 10.00", "﷼ 20.00", "0.00 Pieces", "WALL MOUNT", ""],
        ["View Edit", "Half", "WAREHOUSE B", "﷼ 10.00", "﷼ 20.00", "1.50 Pieces", "WALL MOUNT", ""],
        ["View Edit", "Minus", "WAREHOUSE B", "﷼ 10.00", "﷼ 20.00", "-3 Pieces", "WALL MOUNT", ""],
        footer,
      ],
      ctx(),
    );
    expect(r.ignoredRows).toBe(1);
    expect(r.rows[0].data).toMatchObject({ modelCode: "0001 BLACK", nameEn: "0001 black", cost: "500.00", sellingPrice: "1500.00", stock: [{ location: "WAREHOUSE A", quantity: 1943 }] });
    expect(r.rows[1].data.stock).toEqual([{ location: "WAREHOUSE B", quantity: 745 }]);
    expect(r.rows[1].warnings).toEqual([{ field: "warehouse", key: "import.warnings.severalWarehouses" }]);
    expect(r.rows[2].data.stock).toBeUndefined();
    expect(r.rows[3].errors).toEqual([{ field: "stock", key: "validation.wholeNumber" }]);
    expect(r.rows[4]).toMatchObject({ action: "create", errors: [], warnings: [{ field: "stock", key: "import.warnings.negativeStock" }] });
    expect(r.newCategories).toEqual(["Tabletop TV Mount"]);
  });

  it("finds an existing product by its SKU, and never changes an existing product's stock (PS4)", () => {
    const r = validate([["SKU", "Selling price", "Stock"], ["hmd00042", "300", "9"]], ctx(["HMD-772"]));
    expect(r.rows[0]).toMatchObject({ action: "update", modelCode: "HMD-772", data: { sellingPrice: "300" } });
    expect(r.rows[0].data.stock).toBeUndefined();
    expect(r.rows[0].warnings).toEqual([{ field: "stock", key: "import.warnings.stockNotChanged" }]);
    expect(r.locations).toEqual([]);
  });

  it("an Arabic-only file names new products but never overwrites an existing English name", () => {
    const r = validate([["Model", "Arabic name"], ["HMD-772", "حامل"], ["NEW-1", "رف"]], ctx(["HMD-772"]));
    expect(r.rows[0]).toMatchObject({ action: "update", data: { modelCode: "HMD-772", nameAr: "حامل" } });
    expect(r.rows[0].data.nameEn).toBeUndefined();
    expect(r.rows[1].data).toMatchObject({ nameEn: "رف", nameAr: "رف" });
  });

  it("makes one new category of names that differ only by plural or case (PS5)", () => {
    const r = validate([["Product", "Category"], ["A", "SHELVES UNIT"], ["B", "shelves units"]], ctx());
    expect(r.newCategories).toEqual(["Shelves Unit"]);
    expect(r.rows[0].data.categoryIds).toEqual(r.rows[1].data.categoryIds);
  });

  it("reports a file without a name / model code / SKU column, or without rows", () => {
    expect(validate([["Colour", "Price"], ["Black", "1"]], ctx()).fileErrors).toEqual(["import.errors.noIdentity"]);
    expect(validate([HEAD], ctx()).fileErrors).toEqual(["import.errors.empty"]);
  });

  it("checks barcodes against the file and the database, and finds suppliers by name", () => {
    const head = ["modelCode", "nameEn", "category", "barcode", "supplier", "sellingPrice", "maxLoadKg"];
    const c = ctx([], { products: new Map([["OLD-1", { barcode: "6281234" }]]) });
    const r = validate(
      [
        head,
        ["N-1", "a", "wall-mount", "٦٢٨٩", "Acme Trading", "199.00", "45"],
        ["N-2", "a", "wall-mount", "6281234", "Nobody", "x", "-3"],
        ["N-3", "a", "wall-mount", "6289", "أكمي", "", ""],
      ],
      c,
    );
    expect(r.rows[0].data).toMatchObject({ barcode: "6289", defaultSupplierId: "sup1", sellingPrice: "199.00", maxLoadKg: 45 });
    expect(r.rows[1].errors).toEqual([
      { field: "barcode", key: "products.errors.barcodeTaken" },
      { field: "maxLoadKg", key: "validation.wholeNumber" },
      { field: "sellingPrice", key: "validation.money" },
      { field: "supplier", key: "import.errors.unknownSupplier" },
    ]);
    expect(r.rows[2].errors).toEqual([{ field: "barcode", key: "import.errors.duplicateInFile" }]);
  });
});
