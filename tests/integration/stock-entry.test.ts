import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createEntry, type EntryInput } from "@/server/stock/createEntry";
import { EntryRuleError, InsufficientStockError } from "@/server/stock/errors";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { expectLedgerMatchesLevels, level } from "../helpers/ledger";

type Actor = { id: string; role: "ADMIN" | "STAFF" | "VIEWER"; warehouseIds: string[] };
const actorOf = (u: Awaited<ReturnType<typeof makeUser>>): Actor => ({
  id: u.id,
  role: u.role,
  warehouseIds: u.warehouses.map((w) => w.id),
});

let admin: Actor;
let wh: string;
let p1: string;
let p2: string;

const stockIn = (lines: EntryInput["lines"], extra: Partial<EntryInput> = {}) =>
  createEntry(testDb, admin, { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouseId: wh, lines, ...extra });
const stockOut = (lines: EntryInput["lines"], extra: Partial<EntryInput> = {}) =>
  createEntry(testDb, admin, { direction: "OUT", reason: "WEBSITE_ORDER", warehouseId: wh, lines, ...extra });

beforeEach(async () => {
  await resetDatabase();
  admin = actorOf(await makeUser("ADMIN"));
  wh = (await makeWarehouse("SELLABLE", "Riyadh Main")).id;
  p1 = (await makeProduct("HMD-772")).id;
  p2 = (await makeProduct("HMD-300")).id;
});
afterAll(() => testDb.$disconnect());

describe("numbering", () => {
  it("numbers entries sequentially per prefix without gaps", async () => {
    const a = await stockIn([{ productId: p1, quantity: 5 }]);
    const b = await stockIn([{ productId: p1, quantity: 5 }]);
    const c = await stockOut([{ productId: p1, quantity: 1 }]);
    const d = await stockIn([{ productId: p1, quantity: 5 }]);
    expect([a.number, b.number, c.number, d.number]).toEqual(["IN-000001", "IN-000002", "OUT-000001", "IN-000003"]);
  });

  it("uses COR for corrections", async () => {
    const e = await stockIn([{ productId: p1, quantity: 1 }], { reason: "CORRECTION", note: "count" });
    expect(e.number).toBe("COR-000001");
    expect((await testDb.stockEntry.findUniqueOrThrow({ where: { id: e.id } })).type).toBe("CORRECTION_IN");
  });
});

describe("stock in", () => {
  it("creates a stock level and then adds to it", async () => {
    await stockIn([{ productId: p1, quantity: 5 }]);
    expect(await level(p1, wh)).toBe(5);
    await stockIn([{ productId: p1, quantity: 3 }]);
    expect(await level(p1, wh)).toBe(8);
    await expectLedgerMatchesLevels();
  });

  it("merges the same product on two lines into one line", async () => {
    const e = await stockIn([
      { productId: p1, quantity: 2 },
      { productId: p2, quantity: 1 },
      { productId: p1, quantity: 3 },
    ]);
    const lines = await testDb.stockEntryLine.findMany({ where: { entryId: e.id } });
    expect(lines.map((l) => [l.productId, l.quantity]).sort()).toEqual([[p1, 5], [p2, 1]].sort());
    expect(await level(p1, wh)).toBe(5);
  });

  it("stores who created it and the reference fields", async () => {
    const e = await stockIn([{ productId: p1, quantity: 1 }], { supplierName: " Acme ", reference: "INV-9" });
    const saved = await testDb.stockEntry.findUniqueOrThrow({ where: { id: e.id } });
    expect(saved).toMatchObject({ createdById: admin.id, supplierName: "Acme", reference: "INV-9", type: "IN" });
  });
});

describe("stock out", () => {
  it("decreases stock", async () => {
    await stockIn([{ productId: p1, quantity: 5 }]);
    await stockOut([{ productId: p1, quantity: 2 }]);
    expect(await level(p1, wh)).toBe(3);
    await expectLedgerMatchesLevels();
  });

  it("refuses to go below zero and saves nothing at all", async () => {
    await stockIn([
      { productId: p1, quantity: 3 },
      { productId: p2, quantity: 10 },
    ]);
    const before = { entries: await testDb.stockEntry.count(), lines: await testDb.stockEntryLine.count() };

    const attempt = stockOut([
      { productId: p2, quantity: 1 }, // fine on its own
      { productId: p1, quantity: 4 }, // only 3 left
    ]);
    await expect(attempt).rejects.toBeInstanceOf(InsufficientStockError);
    await expect(attempt).rejects.toMatchObject({
      details: { modelCode: "HMD-772", warehouseName: "Riyadh Main", available: 3, requested: 4 },
    });

    expect(await testDb.stockEntry.count()).toBe(before.entries);
    expect(await testDb.stockEntryLine.count()).toBe(before.lines);
    expect(await level(p1, wh)).toBe(3);
    expect(await level(p2, wh)).toBe(10); // the good line was rolled back too
    expect((await testDb.counter.findUniqueOrThrow({ where: { key: "OUT" } })).value).toBe(0);
    await expectLedgerMatchesLevels();
  });

  it("refuses stock that was never received", async () => {
    await expect(stockOut([{ productId: p1, quantity: 1 }])).rejects.toMatchObject({ details: { available: 0 } });
  });

  it("lets only one of two simultaneous orders take the last unit", async () => {
    await stockIn([{ productId: p1, quantity: 1 }]);
    const results = await Promise.allSettled([
      stockOut([{ productId: p1, quantity: 1 }]),
      stockOut([{ productId: p1, quantity: 1 }]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(InsufficientStockError);
    expect(await level(p1, wh)).toBe(0);
    expect(await testDb.stockEntry.count({ where: { type: "OUT" } })).toBe(1);
    await expectLedgerMatchesLevels();
  });

  it("gives simultaneous saves distinct, consecutive numbers", async () => {
    const saved = await Promise.all(Array.from({ length: 8 }, () => stockIn([{ productId: p1, quantity: 1 }])));
    expect(saved.map((s) => s.number).sort()).toEqual(
      Array.from({ length: 8 }, (_, i) => `IN-${String(i + 1).padStart(6, "0")}`),
    );
    expect(await level(p1, wh)).toBe(8);
  });
});

describe("rules", () => {
  it("rejects STAFF in a warehouse they aren't assigned to, and VIEWER always", async () => {
    const other = (await makeWarehouse()).id;
    const staff = actorOf(await makeUser("STAFF", [wh]));
    const viewer = actorOf(await makeUser("VIEWER", [wh]));
    const input: EntryInput = { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouseId: other, lines: [{ productId: p1, quantity: 1 }] };
    await expect(createEntry(testDb, staff, input)).rejects.toMatchObject({ key: "stock.errors.warehouseNotAssigned" });
    await expect(createEntry(testDb, viewer, { ...input, warehouseId: wh })).rejects.toMatchObject({ key: "errors.forbidden" });
    await expect(createEntry(testDb, staff, { ...input, warehouseId: wh })).resolves.toMatchObject({ number: "IN-000001" });
  });

  it("rejects admin-only reasons for STAFF", async () => {
    const staff = actorOf(await makeUser("STAFF", [wh]));
    await expect(
      createEntry(testDb, staff, { direction: "IN", reason: "OPENING_STOCK", warehouseId: wh, lines: [{ productId: p1, quantity: 1 }] }),
    ).rejects.toMatchObject({ key: "errors.forbidden" });
  });

  it("blocks receiving a deactivated product but allows selling off what's left (Q7)", async () => {
    await stockIn([{ productId: p1, quantity: 2 }]);
    await testDb.product.update({ where: { id: p1 }, data: { active: false } });
    await expect(stockIn([{ productId: p1, quantity: 1 }])).rejects.toMatchObject({ key: "stock.errors.productInactive" });
    await expect(stockOut([{ productId: p1, quantity: 2 }])).resolves.toBeTruthy();
    expect(await level(p1, wh)).toBe(0);
  });

  it("blocks sales from a damaged warehouse (Q4) and inactive warehouses", async () => {
    const damaged = (await makeWarehouse("DAMAGED")).id;
    await createEntry(testDb, admin, { direction: "IN", reason: "CUSTOMER_RETURN", warehouseId: damaged, lines: [{ productId: p1, quantity: 1 }] });
    await expect(stockOut([{ productId: p1, quantity: 1 }], { warehouseId: damaged })).rejects.toMatchObject({
      key: "stock.errors.reasonNotForWarehouse",
    });
    await testDb.warehouse.update({ where: { id: wh }, data: { active: false } });
    await expect(stockIn([{ productId: p1, quantity: 1 }])).rejects.toBeInstanceOf(EntryRuleError);
  });

  it("validates quantities and empty entries", async () => {
    await expect(stockIn([])).rejects.toMatchObject({ key: "stock.errors.noLines" });
    await expect(stockIn([{ productId: p1, quantity: 0 }])).rejects.toMatchObject({ key: "stock.errors.invalidQuantity" });
    await expect(stockIn([{ productId: p1, quantity: 100_001 }])).rejects.toMatchObject({ key: "stock.errors.invalidQuantity" });
    await expect(stockIn([{ productId: "nope", quantity: 1 }])).rejects.toMatchObject({ key: "stock.errors.productNotFound" });
  });
});
