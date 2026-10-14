import { describe, expect, it } from "vitest";
import { navItemsFor } from "./nav";

const keys = (role: Parameters<typeof navItemsFor>[0]) => navItemsFor(role).map((i) => i.key);

describe("navItemsFor", () => {
  it("gives ADMIN every page", () => {
    expect(keys("ADMIN")).toEqual([
      "dashboard",
      "stockIn",
      "stockOut",
      "entries",
      "reports",
      "approvals",
      "products",
      "openingStock",
      "warehouses",
      "users",
      "audit",
      "settings",
    ]);
  });

  it("gives MANAGER and STAFF the stock pages and approvals, no admin pages", () => {
    for (const role of ["MANAGER", "STAFF"] as const) {
      expect(keys(role)).toEqual(["dashboard", "stockIn", "stockOut", "entries", "reports", "approvals"]);
    }
  });

  it("gives ACCOUNTANT read pages and the audit log, TECHNICIAN only his jobs", () => {
    expect(keys("ACCOUNTANT")).toEqual(["dashboard", "entries", "reports", "audit"]);
    expect(keys("VIEWER")).toEqual(["dashboard", "entries", "reports"]);
    expect(keys("TECHNICIAN")).toEqual(["jobs"]);
  });
});
