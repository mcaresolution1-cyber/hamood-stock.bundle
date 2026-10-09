import { describe, expect, it } from "vitest";
import { normalizeModelCode, parseMoney, parseWholeNumber, toWesternDigits } from "./normalize";

describe("normalize", () => {
  it("converts Arabic-Indic and Persian digits", () => {
    expect(toWesternDigits("١٢٣")).toBe("123");
    expect(toWesternDigits("۴۵۶")).toBe("456");
  });

  it("parses whole numbers with separators and Arabic digits", () => {
    expect(parseWholeNumber("1,200")).toBe(1200);
    expect(parseWholeNumber(" ٢٥ ")).toBe(25);
    expect(parseWholeNumber("12.5")).toBeNull();
    expect(parseWholeNumber("-3")).toBeNull();
    expect(parseWholeNumber("abc")).toBeNull();
  });

  it("keeps money as an exact decimal string", () => {
    expect(parseMoney("1,250.50")).toBe("1250.50");
    expect(parseMoney("٨٥٫٥")).toBe("85.5");
    expect(parseMoney("0.1")).toBe("0.1");
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("SAR 5")).toBeNull();
  });

  it("normalises model codes", () => {
    expect(normalizeModelCode("  hmd-772 ")).toBe("HMD-772");
    expect(normalizeModelCode("hmd  ٧٧٢")).toBe("HMD 772");
  });
});
