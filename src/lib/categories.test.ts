import { describe, expect, it } from "vitest";
import { categoryName, categoryNames, splitCategoryCell } from "./categories";

describe("categories", () => {
  it("splits an import cell on every separator, trims and drops duplicates", () => {
    expect(splitCategoryCell(" Wall mounts , floor  stands;TV tables|Monitor mounts / wall MOUNTS ")).toEqual([
      "Wall mounts",
      "floor stands",
      "TV tables",
      "Monitor mounts",
    ]);
    expect(splitCategoryCell("حوامل جدارية، طاولات")).toEqual(["حوامل جدارية", "طاولات"]);
    expect(splitCategoryCell(" , ; ")).toEqual([]);
  });

  it("names a category in the user's language", () => {
    const c = { nameEn: "TV tables", nameAr: "طاولات" };
    expect(categoryName(c, "ar")).toBe("طاولات");
    expect(categoryNames([{ category: c }, { category: { nameEn: "Stands", nameAr: "ستاندات" } }], "en")).toBe("TV tables · Stands");
  });
});

describe("loose category matching (plan import-sku, PS5)", () => {
  it("ignores case, accents, a TV word and plurals; tidies capitals", async () => {
    const { categoryMatchKey, tidyCategoryName, categoryKey } = await import("./categories");
    expect(categoryMatchKey("WALL MOUNT")).toBe(categoryMatchKey("TV wall mounts"));
    expect(categoryMatchKey("FLOOR STAND")).toBe(categoryMatchKey("Floor stands"));
    expect(categoryMatchKey("glass")).toBe("glass");
    expect(categoryKey("Café")).toBe(categoryKey("cafe"));
    expect(tidyCategoryName("TABLETOP TV MOUNT")).toBe("Tabletop TV Mount");
    expect(tidyCategoryName("Monitor arms")).toBe("Monitor arms");
  });
});
