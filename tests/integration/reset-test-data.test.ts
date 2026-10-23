/** Plan reset-test-data: one-time clearing of test data at start-up, and one test login per role. */
import mariadb from "mariadb";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { mariadbConfig } from "@/lib/db-config";
import { createEntry } from "@/server/stock/createEntry";
import { RESET_SETTING_KEY, TEST_LOGINS, resetTestData } from "@/server/db/reset-test-data";
import type { Role } from "@/generated/prisma/enums";
import { testDatabaseUrl } from "../setup/test-db-url";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { expectLedgerMatchesLevels } from "../helpers/ledger";

let conn: mariadb.Connection;
beforeEach(async () => {
  await resetDatabase();
  conn = await mariadb.createConnection(mariadbConfig(testDatabaseUrl()));
});
afterEach(() => conn.end());
afterAll(() => testDb.$disconnect());

async function someTestData() {
  const owner = await makeUser("ADMIN");
  const w = await makeWarehouse("SELLABLE", "WAREHOUSE A");
  const staff = await makeUser("STAFF", [w.id]);
  const p = await makeProduct("HMD00001");
  await testDb.supplier.create({ data: { nameEn: "Acme" } });
  await testDb.category.create({ data: { nameEn: "Shelves", nameAr: "رفوف" } });
  const actor = { id: owner.id, role: "ADMIN" as Role, warehouseIds: [] };
  await createEntry(testDb, actor, { direction: "IN", reason: "OPENING_STOCK", warehouseId: w.id, lines: [{ productId: p.id, quantity: 10 }] });
  await createEntry(testDb, actor, { direction: "OUT", reason: "NOON_ORDER", warehouseId: w.id, reference: "NAE1", lines: [{ productId: p.id, quantity: 2 }] });
  return { owner, staff };
}

describe("resetTestData", () => {
  it("logins are <role>@hamoodtv.com", () => {
    expect(TEST_LOGINS.map((l) => l.email)).toEqual(["admin", "manager", "staff", "technician", "accountant", "viewer"].map((r) => `${r}@hamoodtv.com`));
  });

  it("does nothing unless asked with a long enough value and password", async () => {
    await someTestData();
    expect(await resetTestData(conn, testDb, {})).toBe("skipped");
    expect(await resetTestData(conn, testDb, { token: "short", password: "Temp-Pass-1" })).toBe("skipped");
    expect(await resetTestData(conn, testDb, { token: "clear-2026-10-23", password: "short" })).toBe("skipped");
    expect(await testDb.stockEntry.count()).toBe(2);
  });

  it("clears everything except users, recreates defaults and the role logins, once per value", async () => {
    const { owner, staff } = await someTestData();
    const logs: string[] = [];
    expect(await resetTestData(conn, testDb, { token: "clear-2026-10-23", password: "Temp-Pass-1" }, (m) => logs.push(m))).toBe("reset");

    for (const count of [
      testDb.stockEntry.count(),
      testDb.stockEntryLine.count(),
      testDb.stockLevel.count(),
      testDb.product.count(),
      testDb.supplier.count(),
    ]) {
      expect(await count).toBe(0);
    }
    expect((await testDb.category.findMany({ orderBy: { position: "asc" } })).map((c) => c.id)).toEqual([
      "cat-wall-mount",
      "cat-floor-stand",
      "cat-monitor-mount",
      "cat-tv-table",
    ]);
    const warehouses = await testDb.warehouse.findMany({ orderBy: { name: "asc" } });
    expect(warehouses.map((w) => [w.name, w.kind])).toEqual([
      ["Damaged Stock", "DAMAGED"],
      ["Riyadh Main", "SELLABLE"],
    ]);
    expect((await testDb.counter.findMany()).every((c) => c.value === 0)).toBe(true);
    await expectLedgerMatchesLevels();

    // Existing users are kept (their assignments went with the warehouses)
    expect(await testDb.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({ role: "ADMIN", active: true });
    expect((await testDb.user.findUniqueOrThrow({ where: { id: staff.id }, include: { warehouses: true } })).warehouses).toEqual([]);

    // One login per role, temporary password, must change it
    const logins = await testDb.user.findMany({
      where: { email: { in: TEST_LOGINS.map((l) => l.email) } },
      include: { warehouses: { select: { name: true } } },
      orderBy: { email: "asc" },
    });
    expect(logins.map((u) => u.role).sort()).toEqual(["ACCOUNTANT", "ADMIN", "MANAGER", "STAFF", "TECHNICIAN", "VIEWER"]);
    for (const u of logins) {
      expect(u.mustChangePassword).toBe(true);
      expect(await bcrypt.compare("Temp-Pass-1", u.passwordHash)).toBe(true);
    }
    const byRole = new Map(logins.map((u) => [u.role, u.warehouses.map((w) => w.name).sort()]));
    expect(byRole.get("MANAGER")).toEqual(["Damaged Stock", "Riyadh Main"]);
    expect(byRole.get("STAFF")).toEqual(["Riyadh Main"]);
    expect(await testDb.auditLog.count({ where: { action: "system.resetTestData" } })).toBe(1);
    expect(await testDb.setting.findUnique({ where: { key: RESET_SETTING_KEY } })).not.toBeNull();

    // The app works afterwards: numbering starts again
    const p = await testDb.product.create({ data: { modelCode: "NEW", sku: "HMD00001", nameEn: "New", nameAr: "جديد" } });
    const main = warehouses.find((w) => w.name === "Riyadh Main")!;
    const admin = logins.find((u) => u.role === "ADMIN")!;
    const e = await createEntry(testDb, { id: admin.id, role: "ADMIN", warehouseIds: [] }, { direction: "IN", reason: "OPENING_STOCK", warehouseId: main.id, lines: [{ productId: p.id, quantity: 1 }] });
    expect(e.number).toBe("IN-000001");

    // Same value again (left in the settings) → nothing is cleared
    expect(await resetTestData(conn, testDb, { token: "clear-2026-10-23", password: "Temp-Pass-1" })).toBe("skipped");
    expect(await testDb.stockEntry.count()).toBe(1);
    expect(await testDb.user.count({ where: { email: { in: TEST_LOGINS.map((l) => l.email) } } })).toBe(6);

    // A new value clears again; logins that exist are left alone (password kept), no duplicates,
    // and the manager / staff get the new warehouses again
    expect(await resetTestData(conn, testDb, { token: "clear-again-1", password: "Other-Pass-2" })).toBe("reset");
    expect(await testDb.stockEntry.count()).toBe(0);
    const again = await testDb.user.findMany({
      where: { email: { in: TEST_LOGINS.map((l) => l.email) } },
      include: { warehouses: { select: { name: true } } },
    });
    expect(again).toHaveLength(6);
    for (const u of again) expect(await bcrypt.compare("Temp-Pass-1", u.passwordHash)).toBe(true);
    expect(again.find((u) => u.role === "STAFF")?.warehouses.map((w) => w.name)).toEqual(["Riyadh Main"]);
  });

  it("never changes a real account that already uses one of the login emails", async () => {
    await someTestData();
    const real = await testDb.user.create({
      data: { name: "Owner", email: "admin@hamoodtv.com", role: "ADMIN", passwordHash: await bcrypt.hash("Real-Pass-1", 4) },
    });
    expect(await resetTestData(conn, testDb, { token: "clear-2026-10-23", password: "Temp-Pass-1" })).toBe("reset");
    const after = await testDb.user.findUniqueOrThrow({ where: { id: real.id } });
    expect(after).toMatchObject({ name: "Owner", role: "ADMIN", mustChangePassword: false });
    expect(await bcrypt.compare("Real-Pass-1", after.passwordHash)).toBe(true);
    expect(await testDb.user.count({ where: { email: { in: TEST_LOGINS.map((l) => l.email) } } })).toBe(6);
    expect(await testDb.auditLog.findFirst({ where: { action: "system.resetTestData" } })).toMatchObject({ actorId: real.id });
  });
});
