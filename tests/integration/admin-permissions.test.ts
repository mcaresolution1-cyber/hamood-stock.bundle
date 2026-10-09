import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import * as warehouses from "@/server/actions/warehouses";
import * as users from "@/server/actions/users";
import * as products from "@/server/actions/products";
import * as productImport from "@/server/actions/product-import";
import * as openingStock from "@/server/actions/opening-stock";
import { requirePagePermission } from "@/server/auth/dal";
import { makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { signInAs } from "../helpers/auth";

const fd = () => {
  const f = new FormData();
  f.set("file", new File(["modelCode,quantity\nX,1"], "x.csv"));
  return f;
};

// Every admin action, called with plausible arguments.
const ACTIONS: [string, () => Promise<{ ok: boolean; error?: string }>][] = [
  ["createWarehouse", () => warehouses.createWarehouse({ name: "X", city: "Y", kind: "SELLABLE" })],
  ["updateWarehouse", () => warehouses.updateWarehouse("w", { name: "X", city: "Y", kind: "SELLABLE" })],
  ["setWarehouseActive", () => warehouses.setWarehouseActive("w", false)],
  ["createUser", () => users.createUser({ name: "X", email: "x@x.test", role: "ADMIN", warehouseIds: [], password: "password1" })],
  ["updateUser", () => users.updateUser("u", { name: "X", email: "x@x.test", role: "ADMIN", warehouseIds: [] })],
  ["setUserActive", () => users.setUserActive("u", false)],
  ["resetUserPassword", () => users.resetUserPassword("u", { password: "password1" })],
  ["createProduct", () => products.createProduct({})],
  ["updateProduct", () => products.updateProduct("p", {})],
  ["setProductActive", () => products.setProductActive("p", false)],
  ["previewProductImport", () => productImport.previewProductImport(fd())],
  ["applyProductImport", () => productImport.applyProductImport(fd())],
  ["previewOpeningStock", () => openingStock.previewOpeningStock(fd())],
  ["applyOpeningStock", () => openingStock.applyOpeningStock(fd())],
];

beforeAll(resetDatabase);
afterAll(() => testDb.$disconnect());

describe("admin actions reject non-admins on the server", () => {
  for (const role of ["STAFF", "VIEWER"] as const) {
    it.each(ACTIONS)(`${role}: %s → forbidden`, async (_name, call) => {
      const w = await makeWarehouse();
      signInAs(await makeUser(role, [w.id]));
      expect(await call()).toEqual({ ok: false, error: "errors.forbidden" });
    });
  }

  it("sends STAFF and VIEWER from admin pages to the dashboard with a notice", async () => {
    for (const role of ["STAFF", "VIEWER"] as const) {
      signInAs(await makeUser(role));
      await expect(requirePagePermission("product:manage")).rejects.toMatchObject({
        digest: expect.stringContaining("/?denied=1"),
      });
    }
    signInAs(await makeUser("ADMIN"));
    await expect(requirePagePermission("product:manage")).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("leaves the database untouched", async () => {
    expect(await testDb.stockEntry.count()).toBe(0);
    expect(await testDb.product.count()).toBe(0);
    expect(await testDb.user.count({ where: { email: "x@x.test" } })).toBe(0);
  });
});
