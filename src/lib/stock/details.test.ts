import { describe, expect, it } from "vitest";
import {
  conditionAllowsKind,
  isOrderReason,
  looksLikeEntryNumber,
  normalizeMarketplaceOrder,
  normalizeOrder,
  normalizeWebsiteOrder,
  photoRequired,
  reasonCodesFor,
} from "./details";

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

describe("channels and return conditions (plan channels-returns)", () => {
  it("normalises Noon / Amazon order numbers", () => {
    expect(normalizeMarketplaceOrder(" nae 123٤٥ ")).toBe("NAE12345");
    expect(normalizeMarketplaceOrder("#171-1234567-1234567")).toBe("171-1234567-1234567");
    expect(normalizeMarketplaceOrder("ABC")).toBeNull(); // no digit
    expect(normalizeMarketplaceOrder("x!")).toBeNull();
    expect(normalizeOrder("WEBSITE_ORDER", "NAE123")).toBeNull();
    expect(normalizeOrder("NOON_ORDER", "nae123")).toBe("NAE123");
    expect([conditionAllowsKind("RESELLABLE", "SELLABLE"), conditionAllowsKind("RESELLABLE", "DAMAGED")]).toEqual([true, false]);
    expect([conditionAllowsKind("BROKEN", "SELLABLE"), conditionAllowsKind("BROKEN", "DAMAGED")]).toEqual([true, true]);
    expect([conditionAllowsKind("TRASHED", "SELLABLE"), conditionAllowsKind("TRASHED", "DAMAGED")]).toEqual([false, true]);
    expect(isOrderReason("AMAZON_ORDER")).toBe(true);
    expect(isOrderReason("DIRECT_SALE")).toBe(false);
    expect(reasonCodesFor("SUPPLIER_RETURN")).toContain("WRONG_ITEM");
    expect(reasonCodesFor("DAMAGED_LOST")).not.toContain("RETURNED_TRASHED"); // system-only
  });
});
