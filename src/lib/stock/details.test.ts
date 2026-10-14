import { describe, expect, it } from "vitest";
import { looksLikeEntryNumber, normalizeWebsiteOrder, photoRequired, reasonCodesFor } from "./details";

describe("entry details", () => {
  it("normalises website order numbers", () => {
    expect(normalizeWebsiteOrder("#12345")).toBe("12345");
    expect(normalizeWebsiteOrder(" 12 345 ")).toBe("12345");
    expect(normalizeWebsiteOrder("١٢٣٤٥")).toBe("12345");
    expect(normalizeWebsiteOrder("AB-1")).toBeNull();
    expect(normalizeWebsiteOrder("12")).toBeNull();
  });

  it("knows which reasons use codes and when a photo is required", () => {
    expect(reasonCodesFor("CUSTOMER_RETURN")).toContain("DEFECTIVE");
    expect(reasonCodesFor("DAMAGED_LOST")).toContain("MISSING");
    expect(reasonCodesFor("WEBSITE_ORDER")).toEqual([]);
    expect(photoRequired("DAMAGED_LOST", "BROKEN_DELIVERY")).toBe(true);
    expect(photoRequired("DAMAGED_LOST", "MISSING")).toBe(false);
  });

  it("recognises entry numbers", () => {
    expect(looksLikeEntryNumber("out-000123")).toBe(true);
    expect(looksLikeEntryNumber("12345")).toBe(false);
  });
});
