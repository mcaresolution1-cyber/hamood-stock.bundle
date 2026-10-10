import { describe, expect, it } from "vitest";
import { fieldsFor, keepReasonFields, noteRequired } from "./fields";

describe("reason fields", () => {
  it("lists required fields per reason", () => {
    expect(fieldsFor("DIRECT_SALE").filter((f) => f.required).map((f) => f.field)).toEqual(["customerName", "customerPhone"]);
    expect(fieldsFor("")).toEqual([]);
    expect(noteRequired("CORRECTION")).toBe(true);
    expect(noteRequired("WEBSITE_ORDER")).toBe(false);
  });

  it("drops fields the reason doesn't use", () => {
    expect(
      keepReasonFields("WEBSITE_ORDER", { reference: "W-1", supplierName: "Acme", technicianName: "T", destinationWarehouseId: "w2" }),
    ).toEqual({ reference: "W-1", supplierName: null, technicianName: null, destinationWarehouseId: null });
  });
});
