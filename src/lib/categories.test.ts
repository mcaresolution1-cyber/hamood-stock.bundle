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
