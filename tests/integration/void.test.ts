import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createEntry } from "@/server/stock/createEntry";
import { voidEntry } from "@/server/stock/voidEntry";
import { InsufficientStockError } from "@/server/stock/errors";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { expectLedgerMatchesLevels, level } from "../helpers/ledger";

type Actor = { id: string; role: "ADMIN" | "STAFF" | "VIEWER"; warehouseIds: string[] };
const actorOf = (u: Awaited<ReturnType<typeof makeUser>>): Actor => ({ id: u.id, role: u.role, warehouseIds: u.warehouses.map((w) => w.id) });

let admin: Actor;
let wh: string;
let other: string;
let p1: string;
let p2: string;

const receive = (lines: { productId: string; quantity: number }[], warehouseId = wh) =>
  createEntry(testDb, admin, { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouseId, lines });
const sell = (productId: string, quantity: number) =>
  createEntry(testDb, admin, { direction: "OUT", reason: "WEBSITE_ORDER", warehouseId: wh, reference: "W-1", lines: [{ productId, quantity }] });

beforeEach(async () => {
  await resetDatabase();
  admin = actorOf(await makeUser("ADMIN"));
  wh = (await makeWarehouse("SELLABLE", "Riyadh Main")).id;
  other = (await makeWarehouse("SELLABLE", "Jeddah")).id;
  p1 = (await makeProduct("HMD-772")).id;
  p2 = (await makeProduct("HMD-300")).id;
});
afterAll(() => testDb.$disconnect());

describe("void", () => {
  it("reverses a stock in exactly and marks the original", async () => {
    const e = await receive([
      { productId: p1, quantity: 5 },
      { productId: p2, quantity: 2 },
    ]);
    const { voids } = await voidEntry(testDb, admin, { entryId: e.id, reason: "Wrong warehouse" });
    expect(voids).toEqual([{ id: expect.any(String), number: "VOID-000001", voidedEntryId: e.id }]);

    const original = await testDb.stockEntry.findUniqueOrThrow({ where: { id: e.id } });
    expect(original.voidedAt).not.toBeNull();
    expect(original.voidedById).toBe(admin.id);
    const v = await testDb.stockEntry.findUniqueOrThrow({ where: { id: voids[0].id }, include: { lines: true } });
    expect(v).toMatchObject({ type: "VOID", reason: "VOID", linkedEntryId: e.id, warehouseId: wh, note: "Wrong warehouse" });
    expect(v.lines.map((l) => [l.productId, l.quantity]).sort()).toEqual([[p1, 5], [p2, 2]].sort());
    expect(await level(p1, wh)).toBe(0);
    expect(await level(p2, wh)).toBe(0);
    await expectLedgerMatchesLevels();
  });

  it("puts stock back when a stock out is voided", async () => {
    await receive([{ productId: p1, quantity: 5 }]);
    const out = await sell(p1, 3);
    await voidEntry(testDb, admin, { entryId: out.id, reason: "Order cancelled" });
    expect(await level(p1, wh)).toBe(5);
    await expectLedgerMatchesLevels();
  });

  it("can't void twice, or void a VOID entry", async () => {
    const e = await receive([{ productId: p1, quantity: 1 }]);
    const { voids } = await voidEntry(testDb, admin, { entryId: e.id, reason: "mistake" });
    await expect(voidEntry(testDb, admin, { entryId: e.id, reason: "again" })).rejects.toMatchObject({ key: "void.errors.alreadyVoided" });
    await expect(voidEntry(testDb, admin, { entryId: voids[0].id, reason: "undo" })).rejects.toMatchObject({
      key: "void.errors.cannotVoidVoid",
    });
  });

  it("refuses a void that would make stock negative (Q12b) and changes nothing", async () => {
    const e = await receive([{ productId: p1, quantity: 10 }]);
    await sell(p1, 3);
    await expect(voidEntry(testDb, admin, { entryId: e.id, reason: "wrong qty" })).rejects.toBeInstanceOf(InsufficientStockError);
    const original = await testDb.stockEntry.findUniqueOrThrow({ where: { id: e.id } });
    expect(original.voidedAt).toBeNull();
    expect(await testDb.stockEntry.count({ where: { type: "VOID" } })).toBe(0);
    expect((await testDb.counter.findUniqueOrThrow({ where: { key: "VOID" } })).value).toBe(0);
    expect(await level(p1, wh)).toBe(7);
  });

  it("voids both halves of a transfer whichever half is chosen", async () => {
    await receive([{ productId: p1, quantity: 10 }]);
    for (const half of ["out", "in"] as const) {
      const t = await createEntry(testDb, admin, {
        direction: "OUT",
        reason: "TRANSFER",
        warehouseId: wh,
        destinationWarehouseId: other,
        lines: [{ productId: p1, quantity: 4 }],
      });
      const target = half === "out" ? t.id : t.linked!.id;
      const { voids } = await voidEntry(testDb, admin, { entryId: target, reason: "not sent" });
      expect(voids.map((v) => v.voidedEntryId).sort()).toEqual([t.id, t.linked!.id].sort());
      expect(await level(p1, wh)).toBe(10);
      expect(await level(p1, other)).toBe(0);
    }
    await expectLedgerMatchesLevels();
  });

  it("refuses to void a transfer once the received stock has left the destination", async () => {
    await receive([{ productId: p1, quantity: 5 }]);
    const t = await createEntry(testDb, admin, {
      direction: "OUT",
      reason: "TRANSFER",
      warehouseId: wh,
      destinationWarehouseId: other,
      lines: [{ productId: p1, quantity: 5 }],
    });
    await createEntry(testDb, admin, { direction: "OUT", reason: "DIRECT_SALE", warehouseId: other, customerName: "A", customerPhone: "0500000000", lines: [{ productId: p1, quantity: 2 }] });
    await expect(voidEntry(testDb, admin, { entryId: t.id, reason: "x" + "yz" })).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await level(p1, wh)).toBe(0);
    expect(await level(p1, other)).toBe(3);
  });

  it("lets exactly one of two simultaneous voids of the two transfer halves succeed", async () => {
    await receive([{ productId: p1, quantity: 5 }]);
    const t = await createEntry(testDb, admin, {
      direction: "OUT",
      reason: "TRANSFER",
      warehouseId: wh,
      destinationWarehouseId: other,
      lines: [{ productId: p1, quantity: 5 }],
    });
    const results = await Promise.allSettled([
      voidEntry(testDb, admin, { entryId: t.id, reason: "first" }),
      voidEntry(testDb, admin, { entryId: t.linked!.id, reason: "second" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({
      key: "void.errors.alreadyVoided",
    });
    expect(await testDb.stockEntry.count({ where: { type: "VOID" } })).toBe(2);
    await expectLedgerMatchesLevels();
  });

  it("is ADMIN only and needs a reason", async () => {
    const e = await receive([{ productId: p1, quantity: 1 }]);
    const staff = actorOf(await makeUser("STAFF", [wh]));
    await expect(voidEntry(testDb, staff, { entryId: e.id, reason: "please" })).rejects.toMatchObject({ key: "errors.forbidden" });
    await expect(voidEntry(testDb, admin, { entryId: e.id, reason: " " })).rejects.toMatchObject({ key: "void.errors.reasonRequired" });
  });

  it("is backed by a database rule allowing one void per entry", async () => {
    const e = await receive([{ productId: p1, quantity: 1 }]);
    const row = { type: "VOID" as const, reason: "VOID" as const, warehouseId: wh, linkedEntryId: e.id, createdById: admin.id };
    await testDb.stockEntry.create({ data: { ...row, number: "VOID-T1" } });
    await expect(testDb.stockEntry.create({ data: { ...row, number: "VOID-T2" } })).rejects.toThrow();
  });
});

describe("void and inactive warehouses (B6)", () => {
  it("refuses to put stock back into a deactivated warehouse", async () => {
    await receive([{ productId: p1, quantity: 2 }]);
    const out = await sell(p1, 2); // warehouse is now empty
    await testDb.warehouse.update({ where: { id: wh }, data: { active: false } });
    await expect(voidEntry(testDb, admin, { entryId: out.id, reason: "cancelled" })).rejects.toMatchObject({
      key: "void.errors.warehouseInactive",
    });
    expect(await level(p1, wh)).toBe(0);
    await testDb.warehouse.update({ where: { id: wh }, data: { active: true } });
    await expect(voidEntry(testDb, admin, { entryId: out.id, reason: "cancelled" })).resolves.toBeTruthy();
  });

  it("still voids entries for a deactivated product", async () => {
    const e = await receive([{ productId: p1, quantity: 2 }]);
    await testDb.product.update({ where: { id: p1 }, data: { active: false } });
    await expect(voidEntry(testDb, admin, { entryId: e.id, reason: "wrong product" })).resolves.toBeTruthy();
  });
});
