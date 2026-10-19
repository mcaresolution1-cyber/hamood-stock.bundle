import { describe, expect, it } from "vitest";
import { activeNavKey, navItemsFor } from "./nav";

const keys = (role: Parameters<typeof navItemsFor>[0]) => navItemsFor(role).map((i) => i.key);

describe("navItemsFor", () => {
  it("gives ADMIN every page; Add / Import product are buttons on the Products page, not menu items", () => {
    expect(keys("ADMIN")).toEqual([
      "dashboard",
      "stockIn",
      "stockOut",
      "entries",
      "reports",
      "approvals",
      "products",
      "categories",
      "suppliers",
      "openingStock",
      "warehouses",
      "users",
      "audit",
      "settings",
    ]);
    expect(navItemsFor("ADMIN").filter((i) => i.section === "catalog").map((i) => i.key)).toEqual([
      "products",
      "categories",
      "suppliers",
    ]);
  });

  it("gives MANAGER and STAFF the stock pages and approvals; managers also suppliers", () => {
    expect(keys("STAFF")).toEqual(["dashboard", "stockIn", "stockOut", "entries", "reports", "approvals"]);
    expect(keys("MANAGER")).toEqual(["dashboard", "stockIn", "stockOut", "entries", "reports", "approvals", "suppliers"]);
  });

  it("gives ACCOUNTANT read pages and the audit log, TECHNICIAN only his jobs", () => {
    expect(keys("ACCOUNTANT")).toEqual(["dashboard", "entries", "reports", "audit"]);
    expect(keys("VIEWER")).toEqual(["dashboard", "entries", "reports"]);
    expect(keys("TECHNICIAN")).toEqual(["jobs"]);
  });

  it("highlights the most specific page", () => {
    const items = navItemsFor("ADMIN");
    expect(activeNavKey(items, "/admin/products/new")).toBe("products");
    expect(activeNavKey(items, "/admin/products/abc/edit")).toBe("products");
    expect(activeNavKey(items, "/")).toBe("dashboard");
    expect(activeNavKey(items, "/entries/x")).toBe("entries");
    expect(activeNavKey(items, "/account/password")).toBeNull();
  });
});
