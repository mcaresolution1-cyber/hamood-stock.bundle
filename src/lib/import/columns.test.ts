import { describe, expect, it } from "vitest";
import { applyMapping, mappingProblems, normalizeHeader, suggestMapping } from "./columns";
import { sheetFromMatrix } from "./sheet";

describe("column matching (PU3)", () => {
  it("normalises headers in any script", () => {
    expect(normalizeHeader(" Model No. ")).toBe("modelno");
    expect(normalizeHeader("اسم المنتج")).toBe("اسمالمنتج");
    expect(normalizeHeader("Selling_Price (SAR)")).toBe("sellingpricesar");
  });

  it("suggests fields for English, Arabic and template headers, one column per field", () => {
    expect(suggestMapping(["Item Code", "Product Name", "الاسم", "Category", "Price", "Colour", "Notes"])).toEqual({
      "0": "modelcode",
      "1": "nameen",
      "2": "namear",
      "3": "category",
      "4": "sellingprice",
      "5": "colour",
      "6": "",
    });
    expect(suggestMapping(["modelCode", "nameEn", "nameAr", "category", "cost"])).toEqual({
      "0": "modelcode",
      "1": "nameen",
      "2": "namear",
      "3": "category",
      "4": "cost",
    });
    // two price-like columns: the stronger name wins, the other is skipped
    expect(suggestMapping(["Price", "Selling price"])).toEqual({ "0": "", "1": "sellingprice" });
  });

  it("uses the cells: an Arabic 'Name' column is the Arabic name; a WooCommerce SKU is the model code", () => {
    expect(suggestMapping(["SKU", "Name", "Regular price", "Categories"], [["HMD-1"], ["حامل جداري"], ["199"], ["Mounts"]])).toEqual({
      "0": "modelcode",
      "1": "namear",
      "2": "sellingprice",
      "3": "category",
    });
  });

  it("reports duplicate and missing required fields", () => {
    expect(mappingProblems({ "0": "modelcode", "1": "modelcode", "2": "" })).toEqual({ duplicates: ["modelcode"], missing: ["nameen", "namear", "category"] });
  });

  it("maps cells by column position and skips a title line above the table", () => {
    const sheet = sheetFromMatrix([["Hamood price list 2026"], ["Code", "Name", "Name"], ["HMD-1", "Mount", "حامل"]]);
    expect(sheet.labels).toEqual(["Code", "Name", "Name"]);
    expect(sheet.rows[0].row).toBe(3);
    const mapped = applyMapping(sheet, { "0": "modelcode", "1": "nameen", "2": "namear" });
    expect(mapped.headers).toEqual(["modelcode", "nameen", "namear"]);
    expect(mapped.rows[0].values).toEqual({ modelcode: "HMD-1", nameen: "Mount", namear: "حامل" });
  });
});
