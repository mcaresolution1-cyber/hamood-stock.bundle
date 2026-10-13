import { describe, expect, it } from "vitest";
import { ALL_ACTIONS, can, canWriteToWarehouse } from "./permissions";

describe("can", () => {
  it("lets ADMIN do everything", () => {
    for (const action of ALL_ACTIONS) expect(can("ADMIN", action)).toBe(true);
  });

  it("lets STAFF create entries, request corrections and view stock, but not see cost or void", () => {
    expect(can("STAFF", "entry:create")).toBe(true);
    expect(can("STAFF", "stock:view")).toBe(true);
    expect(can("STAFF", "entry:correct")).toBe(true);
    expect(can("STAFF", "cost:view")).toBe(false);
    expect(can("STAFF", "entry:void")).toBe(false);
    expect(can("STAFF", "approval:decide")).toBe(false);
    expect(can("STAFF", "product:manage")).toBe(false);
  });

  it("lets MANAGER void and approve, but not manage the catalogue, users or see cost", () => {
    for (const a of ["entry:create", "entry:correct", "entry:void", "stock:view", "approval:decide"] as const) {
      expect(can("MANAGER", a)).toBe(true);
    }
    for (const a of ["cost:view", "product:manage", "warehouse:manage", "user:manage", "openingStock:import", "settings:manage", "audit:view"] as const) {
      expect(can("MANAGER", a)).toBe(false);
    }
  });

  it("lets ACCOUNTANT read stock, cost and the audit log only", () => {
    expect(ALL_ACTIONS.filter((a) => can("ACCOUNTANT", a))).toEqual(["stock:view", "cost:view", "audit:view"]);
  });

  it("gives TECHNICIAN only his own jobs", () => {
    expect(ALL_ACTIONS.filter((a) => can("TECHNICIAN", a))).toEqual([]);
    expect(can("TECHNICIAN", "job:own")).toBe(true);
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

  it("allows MANAGER only in assigned warehouses", () => {
    const manager = { role: "MANAGER" as const, warehouseIds: ["w1"] };
    expect(canWriteToWarehouse(manager, "w1")).toBe(true);
    expect(canWriteToWarehouse(manager, "w2")).toBe(false);
  });

  it("never allows VIEWER, ACCOUNTANT or TECHNICIAN, even if warehouses are assigned", () => {
    for (const role of ["VIEWER", "ACCOUNTANT", "TECHNICIAN"] as const) {
      expect(canWriteToWarehouse({ role, warehouseIds: ["w1"] }, "w1")).toBe(false);
    }
  });
});
