import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createEntry } from "@/server/stock/createEntry";
import { voidEntry } from "@/server/stock/voidEntry";
import { lowStock, movements, outByReason, stockOnHand } from "@/server/queries/reports";
import { getProductStock } from "@/server/queries/product-stock";
import { dashboardStats } from "@/server/queries/dashboard";
import { isValidDay, listEntries, parseEntryFilters, parsePage } from "@/server/queries/entries";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { level } from "../helpers/ledger";

type Actor = { id: string; name: string; email: string; role: "ADMIN" | "STAFF" | "VIEWER"; warehouseIds: string[] };
const actorOf = (u: Awaited<ReturnType<typeof makeUser>>): Actor => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  warehouseIds: u.warehouses.map((w) => w.id),
});

let admin: Actor;
let staff: Actor;
let main: string;
let jeddah: string;
let damaged: string;
let p1: string;
let p2: string;

const inn = (warehouseId: string, productId: string, quantity: number) =>
  createEntry(testDb, admin, { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouseId, lines: [{ productId, quantity }] });
const out = (warehouseId: string, productId: string, quantity: number, reason: "WEBSITE_ORDER" | "DIRECT_SALE" = "WEBSITE_ORDER") =>
  createEntry(testDb, admin, { direction: "OUT", reason, warehouseId, reference: "W", customerName: "C", customerPhone: "0500000000", lines: [{ productId, quantity }] });
const transfer = (from: string, to: string, productId: string, quantity: number) =>
  createEntry(testDb, admin, { direction: "OUT", reason: "TRANSFER", warehouseId: from, destinationWarehouseId: to, lines: [{ productId, quantity }] });

/** Test fixture only: move an entry's business date (the app never back-dates, decision Q16). */
async function setDate(id: string, iso: string) {
  // rules-allow: ledger-mutation — test fixture back-dating to check month bucketing
  await testDb.stockEntry.update({ where: { id }, data: { entryDate: new Date(iso), createdAt: new Date(iso) } });
}

beforeEach(async () => {
  await resetDatabase();
  admin = actorOf(await makeUser("ADMIN"));
  main = (await makeWarehouse("SELLABLE", "Riyadh Main")).id;
  jeddah = (await makeWarehouse("SELLABLE", "Jeddah")).id;
  damaged = (await makeWarehouse("DAMAGED", "Damaged Stock")).id;
  staff = actorOf(await makeUser("STAFF", [main]));
  p1 = (await makeProduct("HMD-772")).id;
  p2 = (await makeProduct("HMD-300")).id;
  await testDb.product.update({ where: { id: p1 }, data: { cost: "85.50", lowStockLevel: 10 } });
});
afterAll(() => testDb.$disconnect());

describe("stock card", () => {
  it("ends on the same balance as StockLevel after in, out, transfer and a void", async () => {
    await inn(main, p1, 20);
    const sale = await out(main, p1, 3);
    await transfer(main, jeddah, p1, 5);
    await out(jeddah, p1, 2, "DIRECT_SALE");
    await voidEntry(testDb, admin, { entryId: sale.id, reason: "cancelled" });

    const all = await getProductStock(admin, p1);
    expect(all!.card[0].balance).toBe((await level(p1, main)) + (await level(p1, jeddah)));
    expect(all!.total).toBe(18);
    const perMain = await getProductStock(admin, p1, main);
    expect(perMain!.card[0].balance).toBe(await level(p1, main));
    expect(perMain!.card.map((r) => [r.type, r.change])).toEqual([
      ["VOID", 3],
      ["TRANSFER_OUT", -5],
      ["OUT", -3],
      ["IN", 20],
    ]);
    const perJeddah = await getProductStock(admin, p1, jeddah);
    expect(perJeddah!.card[0].balance).toBe(await level(p1, jeddah));
  });

  it("shows cost only to ADMIN", async () => {
    expect((await getProductStock(admin, p1))!.product).toHaveProperty("cost", "85.50");
    expect((await getProductStock(staff, p1))!.product).not.toHaveProperty("cost");
  });
});

describe("stock on hand", () => {
  it("has per-warehouse quantities and totals; value only for ADMIN, exact decimals", async () => {
    await inn(main, p1, 3);
    await inn(jeddah, p1, 4);
    await inn(main, p2, 2); // p2 has no cost
    const a = await stockOnHand(admin, {});
    const r1 = a.rows.find((r) => r.modelCode === "HMD-772")!;
    expect(r1.qty).toEqual({ [main]: 3, [jeddah]: 4 });
    expect(r1.total).toBe(7);
    expect(r1.value).toBe("598.50"); // 85.50 × 7, no float error
    expect(a.rows.find((r) => r.modelCode === "HMD-300")!.value).toBeNull();
    expect(a.totals).toMatchObject({ units: 9, value: "598.50", missingCost: 1 });

    const s = await stockOnHand(staff, {});
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/"cost"|"value"|85\.5/);
    expect(s.showCost).toBe(false);
  });

  it("filters by category and hides inactive products with no stock", async () => {
    await testDb.product.update({ where: { id: p2 }, data: { active: false } });
    expect((await stockOnHand(admin, {})).rows.map((r) => r.modelCode)).toEqual(["HMD-772"]);
    expect((await stockOnHand(admin, { category: "tv-table" })).rows).toEqual([]);
  });
});

describe("low stock (Q5)", () => {
  it("lists products whose total sellable stock is at or below their level; damaged stock doesn't count", async () => {
    await inn(main, p1, 6);
    await createEntry(testDb, admin, { direction: "IN", reason: "CUSTOMER_RETURN", returnCondition: "DAMAGED", warehouseId: damaged, customerName: "x", lines: [{ productId: p1, quantity: 50 }] });
    let r = await lowStock({});
    expect(r.rows.map((x) => [x.modelCode, x.total, x.shortBy])).toEqual([["HMD-772", 6, 4]]);
    expect(r.warehouses.map((w) => w.name)).toEqual(["Jeddah", "Riyadh Main"]);
    await inn(jeddah, p1, 5); // 11 > 10
    r = await lowStock({});
    expect(r.rows).toEqual([]);
    // lowStockLevel 0 never alerts, even at zero stock (p2)
    expect((await dashboardStats()).lowStockCount).toBe(0);
  });
});

describe("stock out by reason", () => {
  it("buckets by Riyadh month (23:30 on the 31st stays in that month) and excludes voided entries", async () => {
    await inn(main, p1, 100);
    const a = await out(main, p1, 2); // 31 Jan 23:30 Riyadh = 31 Jan 20:30 UTC
    await setDate(a.id, "2026-01-31T20:30:00Z");
    const b = await out(main, p1, 3); // 1 Feb 00:30 Riyadh = 31 Jan 21:30 UTC
    await setDate(b.id, "2026-01-31T21:30:00Z");
    const c = await out(main, p1, 4, "DIRECT_SALE");
    await setDate(c.id, "2026-02-10T09:00:00Z");
    const d = await out(main, p1, 7); // voided → excluded, and so is its VOID entry
    await setDate(d.id, "2026-02-11T09:00:00Z");
    await voidEntry(testDb, admin, { entryId: d.id, reason: "cancelled" });
    const t = await transfer(main, jeddah, p1, 5);
    await setDate(t.id, "2026-02-12T09:00:00Z");

    const r = await outByReason({ from: "2026-01", to: "2026-02" });
    expect(r.rows).toEqual([
      { month: "2026-02", byReason: { WEBSITE_ORDER: 3, DIRECT_SALE: 4, TRANSFER: 5 }, total: 7 }, // transfer not in total (Q15)
      { month: "2026-01", byReason: { WEBSITE_ORDER: 2 }, total: 2 },
    ]);
    expect(r.grandTotal).toBe(9);
    // With a warehouse chosen, transfers out of it count
    const perMain = await outByReason({ from: "2026-01", to: "2026-02", warehouseId: main });
    expect(perMain.rows[0].total).toBe(12);
  });
});

describe("movements", () => {
  it("lists every line with a signed quantity, and filters by product", async () => {
    await inn(main, p1, 5);
    await out(main, p1, 2);
    await inn(main, p2, 1);
    const all = await movements({});
    expect(all.total).toBe(3);
    const m = await movements({ product: "772" });
    expect(m.rows.map((r) => r.quantity).sort()).toEqual([-2, 5]);
  });
});

describe("dashboard", () => {
  it("counts today's entries once per transfer and not voids", async () => {
    await inn(main, p1, 20); // 1
    const s = await out(main, p1, 1); // 2
    await transfer(main, jeddah, p1, 2); // 3 (IN half not counted)
    await voidEntry(testDb, admin, { entryId: s.id, reason: "x-y" }); // void not counted
    const d = await dashboardStats();
    expect(d.todayEntries).toBe(3);
    expect(d.activeProducts).toBe(2);
  });
});

describe("bad URL input never breaks a report", () => {
  it("ignores impossible dates, months, pages and inactive warehouses", async () => {
    expect(isValidDay("2026-02-28")).toBe(true);
    for (const d of ["2026-13-01", "2026-02-30", "2026-1-01", "x"]) expect(isValidDay(d)).toBe(false);
    for (const [v, n] of [["1.9", 1], ["3", 3], ["-2", 1], ["abc", 1], ["1e40", 10_000]] as const) expect(parsePage(v)).toBe(n);

    const f = parseEntryFilters({ from: "2026-13-01", to: "2026-02-30", page: "1.001" });
    expect(f).toMatchObject({ from: undefined, to: undefined, page: 1 });
    await expect(movements(f, { page: f.page })).resolves.toBeDefined();
    await expect(listEntries({ from: "2026-13-01", page: 1e9 })).resolves.toBeDefined();

    const r = await outByReason({ from: "2026-13", to: "2026-00" });
    expect(r.toMonth).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);

    const closed = await makeWarehouse("SELLABLE", "Closed");
    await testDb.warehouse.update({ where: { id: closed.id }, data: { active: false } });
    const byClosed = await outByReason({ warehouseId: closed.id });
    expect(byClosed.warehouseId).toBeUndefined();
    expect(byClosed.transfersInTotal).toBe(false);
    expect((await outByReason({ warehouseId: main })).warehouseId).toBe(main);
  });
});
