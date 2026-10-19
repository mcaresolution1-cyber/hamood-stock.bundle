import { describe, expect, it } from "vitest";
import { parseMoneyCell, parseStockCell } from "./normalize";
import { formatSku } from "@/lib/products";

describe("cells from other software (plan import-sku, PS6)", () => {
  it("reads prices with currency signs and words", () => {
    expect(parseMoneyCell("﷼ 500.00")).toBe("500.00");
    expect(parseMoneyCell("SAR 1,250")).toBe("1250");
    expect(parseMoneyCell("٣٥٠ ر.س")).toBe("350");
    expect(parseMoneyCell("free")).toBeNull();
  });

  it("reads stock with units and thousands separators", () => {
    expect(parseStockCell("1,943.00 Pieces")).toBe(1943);
    expect(parseStockCell("12 pcs")).toBe(12);
    expect(parseStockCell("٥ قطع")).toBe(5);
    expect(parseStockCell("1.50 Pieces")).toBe("fraction");
    expect(parseStockCell("-3")).toBe("negative");
    expect(parseStockCell("many")).toBeNull();
  });
});

describe("formatSku (PS1)", () => {
  it("is HMD00 + at least 3 digits, in order", () => {
    expect([1, 42, 999, 1000, 12345].map(formatSku)).toEqual(["HMD00001", "HMD00042", "HMD00999", "HMD001000", "HMD0012345"]);
    expect(() => formatSku(0)).toThrow();
  });
});
