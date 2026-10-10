import { describe, expect, it } from "vitest";
import { can, canWriteToWarehouse } from "./permissions";

describe("can", () => {
  it("lets ADMIN do everything", () => {
    for (const action of [
      "entry:create",
      "entry:correct",
      "entry:void",
      "stock:view",
      "cost:view",
      "product:manage",
      "warehouse:manage",
      "user:manage",
    ] as const) {
      expect(can("ADMIN", action)).toBe(true);
    }
  });

  it("lets STAFF create entries and view stock, but not see cost, correct or void", () => {
    expect(can("STAFF", "entry:create")).toBe(true);
    expect(can("STAFF", "stock:view")).toBe(true);
    expect(can("STAFF", "cost:view")).toBe(false);
    expect(can("STAFF", "entry:void")).toBe(false);
    expect(can("STAFF", "entry:correct")).toBe(false);
    expect(can("STAFF", "product:manage")).toBe(false);
  });

  it("keeps VIEWER read-only", () => {
    expect(can("VIEWER", "stock:view")).toBe(true);
    expect(can("VIEWER", "entry:create")).toBe(false);
    expect(can("VIEWER", "entry:void")).toBe(false);
    expect(can("VIEWER", "cost:view")).toBe(false);
  });
});

describe("canWriteToWarehouse", () => {
  it("allows ADMIN in any warehouse", () => {
    expect(canWriteToWarehouse({ role: "ADMIN", warehouseIds: [] }, "w1")).toBe(true);
  });

  it("allows STAFF only in assigned warehouses", () => {
    const staff = { role: "STAFF" as const, warehouseIds: ["w1"] };
    expect(canWriteToWarehouse(staff, "w1")).toBe(true);
    expect(canWriteToWarehouse(staff, "w2")).toBe(false);
  });

  it("never allows VIEWER, even if warehouses are assigned", () => {
    expect(canWriteToWarehouse({ role: "VIEWER", warehouseIds: ["w1"] }, "w1")).toBe(false);
  });
});
