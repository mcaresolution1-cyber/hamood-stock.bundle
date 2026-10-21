import { describe, expect, it } from "vitest";
import { entryPermissionError, entryTypeFor, formReasons, isReasonAllowed, reasonAllowedForKind } from "./policy";

const admin = { id: "a", role: "ADMIN" as const, warehouseIds: [] };
const staff = { id: "s", role: "STAFF" as const, warehouseIds: ["w1"] };
const viewer = { id: "v", role: "VIEWER" as const, warehouseIds: ["w1"] };
const manager = { id: "m", role: "MANAGER" as const, warehouseIds: ["w1"] };
const sellable = (id: string) => ({ id, kind: "SELLABLE" as const });
const damaged = (id: string) => ({ id, kind: "DAMAGED" as const });

describe("entryTypeFor", () => {
  it("maps direction + reason to the saved type", () => {
    expect(entryTypeFor("IN", "SUPPLIER_DELIVERY")).toBe("IN");
    expect(entryTypeFor("IN", "OPENING_STOCK")).toBe("IN");
    expect(entryTypeFor("OUT", "WEBSITE_ORDER")).toBe("OUT");
    expect(entryTypeFor("IN", "CORRECTION")).toBe("CORRECTION_IN");
    expect(entryTypeFor("OUT", "CORRECTION")).toBe("CORRECTION_OUT");
    expect(entryTypeFor("OUT", "TRANSFER")).toBe("TRANSFER_OUT");
  });
});

describe("isReasonAllowed / formReasons", () => {
  it("keeps opening stock admin-only and return-to-supplier from STAFF", () => {
    expect(isReasonAllowed("ADMIN", "IN", "OPENING_STOCK")).toBe(true);
    expect(isReasonAllowed("MANAGER", "IN", "OPENING_STOCK")).toBe(false);
    expect(isReasonAllowed("STAFF", "IN", "OPENING_STOCK")).toBe(false);
    expect(isReasonAllowed("MANAGER", "OUT", "SUPPLIER_RETURN")).toBe(true);
    expect(isReasonAllowed("STAFF", "OUT", "SUPPLIER_RETURN")).toBe(false);
  });

  it("lets STAFF and MANAGER record corrections and damaged/lost (approval decides, A2)", () => {
    for (const [dir, reason] of [
      ["IN", "CORRECTION"],
      ["OUT", "CORRECTION"],
      ["OUT", "DAMAGED_LOST"],
    ] as const) {
      expect(isReasonAllowed("STAFF", dir, reason)).toBe(true);
      expect(isReasonAllowed("MANAGER", dir, reason)).toBe(true);
    }
  });

  it("lets TECHNICIAN, ACCOUNTANT and VIEWER record nothing", () => {
    for (const role of ["TECHNICIAN", "ACCOUNTANT", "VIEWER"] as const) {
      expect(formReasons(role, "IN")).toEqual([]);
      expect(formReasons(role, "OUT")).toEqual([]);
    }
  });

  it("rejects reasons used in the wrong direction and everything for VIEWER", () => {
    expect(isReasonAllowed("ADMIN", "IN", "WEBSITE_ORDER")).toBe(false);
    expect(isReasonAllowed("ADMIN", "OUT", "SUPPLIER_DELIVERY")).toBe(false);
    expect(isReasonAllowed("VIEWER", "IN", "SUPPLIER_DELIVERY")).toBe(false);
  });

  it("lists form reasons per role", () => {
    expect(formReasons("STAFF", "IN")).toEqual(["SUPPLIER_DELIVERY", "CUSTOMER_RETURN", "CORRECTION"]);
    expect(formReasons("ADMIN", "IN")).toEqual(["SUPPLIER_DELIVERY", "CUSTOMER_RETURN", "CORRECTION"]);
    expect(formReasons("STAFF", "OUT")).toEqual([
      "WEBSITE_ORDER",
      "NOON_ORDER",
      "AMAZON_ORDER",
      "DIRECT_SALE",
      "INSTALLATION",
      "TRANSFER",
      "DAMAGED_LOST",
      "CORRECTION",
    ]);
    expect(formReasons("MANAGER", "OUT")).toEqual([
      "WEBSITE_ORDER",
      "NOON_ORDER",
      "AMAZON_ORDER",
      "DIRECT_SALE",
      "INSTALLATION",
      "TRANSFER",
      "SUPPLIER_RETURN",
      "DAMAGED_LOST",
      "CORRECTION",
    ]);
    expect(formReasons("VIEWER", "OUT")).toEqual([]);
  });
});

describe("reasonAllowedForKind (Q4)", () => {
  it("allows sales only from sellable warehouses", () => {
    expect(reasonAllowedForKind("WEBSITE_ORDER", "DAMAGED")).toBe(false);
    expect(reasonAllowedForKind("DIRECT_SALE", "DAMAGED")).toBe(false);
    expect(reasonAllowedForKind("INSTALLATION", "DAMAGED")).toBe(false);
    expect(reasonAllowedForKind("SUPPLIER_RETURN", "DAMAGED")).toBe(true);
    expect(reasonAllowedForKind("WEBSITE_ORDER", "SELLABLE")).toBe(true);
  });
});

describe("entryPermissionError", () => {
  it("lets STAFF work only in assigned warehouses", () => {
    expect(entryPermissionError(staff, { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouse: sellable("w1") })).toBeNull();
    expect(entryPermissionError(staff, { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouse: sellable("w2") })).toBe(
      "stock.errors.warehouseNotAssigned",
    );
  });

  it("allows any STAFF to put a damaged customer return into a DAMAGED warehouse (Q2)", () => {
    expect(entryPermissionError(staff, { direction: "IN", reason: "CUSTOMER_RETURN", warehouse: damaged("d1") })).toBeNull();
    // …but no other reason into an unassigned damaged warehouse
    expect(entryPermissionError(staff, { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouse: damaged("d1") })).toBe(
      "stock.errors.warehouseNotAssigned",
    );
  });

  it("lets MANAGER work only in assigned warehouses", () => {
    expect(entryPermissionError(manager, { direction: "OUT", reason: "SUPPLIER_RETURN", warehouse: sellable("w1") })).toBeNull();
    expect(entryPermissionError(manager, { direction: "OUT", reason: "SUPPLIER_RETURN", warehouse: sellable("w2") })).toBe(
      "stock.errors.warehouseNotAssigned",
    );
  });

  it("rejects manager reasons for STAFF and everything for VIEWER", () => {
    expect(entryPermissionError(staff, { direction: "OUT", reason: "SUPPLIER_RETURN", warehouse: sellable("w1") })).toBe(
      "errors.forbidden",
    );
    expect(entryPermissionError(viewer, { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouse: sellable("w1") })).toBe(
      "errors.forbidden",
    );
  });

  it("lets ADMIN use any warehouse but still blocks sales from DAMAGED", () => {
    expect(entryPermissionError(admin, { direction: "IN", reason: "OPENING_STOCK", warehouse: sellable("w9") })).toBeNull();
    expect(entryPermissionError(admin, { direction: "OUT", reason: "WEBSITE_ORDER", warehouse: damaged("d1") })).toBe(
      "stock.errors.reasonNotForWarehouse",
    );
  });

  it("rejects a reason in the wrong direction", () => {
    expect(entryPermissionError(admin, { direction: "IN", reason: "WEBSITE_ORDER", warehouse: sellable("w1") })).toBe(
      "stock.errors.invalidReason",
    );
  });
});
