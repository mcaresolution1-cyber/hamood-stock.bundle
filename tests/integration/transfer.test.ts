import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createEntry, type EntryInput } from "@/server/stock/createEntry";
import { InsufficientStockError } from "@/server/stock/errors";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { expectLedgerMatchesLevels, level } from "../helpers/ledger";

type Actor = { id: string; role: "ADMIN" | "STAFF" | "VIEWER"; warehouseIds: string[] };
const actorOf = (u: Awaited<ReturnType<typeof makeUser>>): Actor => ({ id: u.id, role: u.role, warehouseIds: u.warehouses.map((w) => w.id) });

let admin: Actor;
let riyadh: string;
let jeddah: string;
let p1: string;

const receive = (warehouseId: string, quantity: number) =>
  createEntry(testDb, admin, { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouseId, lines: [{ productId: p1, quantity }] });
const transfer = (actor: Actor, from: string, to: string, quantity: number, extra: Partial<EntryInput> = {}) =>
  createEntry(testDb, actor, {
    direction: "OUT",
    reason: "TRANSFER",
    warehouseId: from,
    destinationWarehouseId: to,
    lines: [{ productId: p1, quantity }],
    ...extra,
  });

beforeEach(async () => {
  await resetDatabase();
  admin = actorOf(await makeUser("ADMIN"));
  riyadh = (await makeWarehouse("SELLABLE", "Riyadh Main")).id;
  jeddah = (await makeWarehouse("SELLABLE", "Jeddah")).id;
  p1 = (await makeProduct("HMD-772")).id;
});
afterAll(() => testDb.$disconnect());

describe("transfers", () => {
  it("saves a linked OUT/IN pair sharing one number and moves the stock", async () => {
    await receive(riyadh, 10);
    const saved = await transfer(admin, riyadh, jeddah, 4, { note: "for showroom" });
    expect(saved.number).toBe("TRF-000001");
    expect(saved.linked?.number).toBe("TRF-000001-IN");

    const out = await testDb.stockEntry.findUniqueOrThrow({ where: { id: saved.id }, include: { linkedFrom: true } });
    const inHalf = await testDb.stockEntry.findUniqueOrThrow({ where: { id: saved.linked!.id } });
    expect(out).toMatchObject({ type: "TRANSFER_OUT", reason: "TRANSFER", warehouseId: riyadh, linkedEntryId: null });
    expect(inHalf).toMatchObject({ type: "TRANSFER_IN", reason: "TRANSFER", warehouseId: jeddah, linkedEntryId: out.id, note: "for showroom" });
    expect(out.linkedFrom.map((e) => e.id)).toEqual([inHalf.id]);
    expect(await level(p1, riyadh)).toBe(6);
    expect(await level(p1, jeddah)).toBe(4);
    await expectLedgerMatchesLevels();
  });

  it("saves neither half when the source doesn't have enough", async () => {
    await receive(riyadh, 2);
    await expect(transfer(admin, riyadh, jeddah, 3)).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await testDb.stockEntry.count({ where: { reason: "TRANSFER" } })).toBe(0);
    expect(await level(p1, jeddah)).toBe(0);
    expect((await testDb.counter.findUniqueOrThrow({ where: { key: "TRF" } })).value).toBe(0);
  });

  it("rejects same source and destination, missing or inactive destination", async () => {
    await receive(riyadh, 5);
    await expect(transfer(admin, riyadh, riyadh, 1)).rejects.toMatchObject({ key: "stock.errors.sameWarehouse" });
    await expect(transfer(admin, riyadh, "", 1)).rejects.toMatchObject({ key: "stock.errors.noDestination" });
    await testDb.warehouse.update({ where: { id: jeddah }, data: { active: false } });
    await expect(transfer(admin, riyadh, jeddah, 1)).rejects.toMatchObject({ key: "stock.errors.warehouseInactive" });
  });

  it("lets STAFF transfer from an assigned warehouse to an unassigned one, but not from an unassigned one (Q1)", async () => {
    await receive(riyadh, 5);
    await receive(jeddah, 5);
    const staff = actorOf(await makeUser("STAFF", [riyadh]));
    await expect(transfer(staff, riyadh, jeddah, 1)).resolves.toMatchObject({ number: "TRF-000001" });
    await expect(transfer(staff, jeddah, riyadh, 1)).rejects.toMatchObject({ key: "stock.errors.warehouseNotAssigned" });
  });

  it("can move stock out of a damaged warehouse", async () => {
    const damaged = (await makeWarehouse("DAMAGED")).id;
    await createEntry(testDb, admin, {
      direction: "IN",
      reason: "CUSTOMER_RETURN",
      returnCondition: "DAMAGED",
      warehouseId: damaged,
      lines: [{ productId: p1, quantity: 1 }],
    });
    await expect(transfer(admin, damaged, riyadh, 1)).resolves.toBeTruthy();
  });
});

describe("customer returns", () => {
  it("lets any STAFF put a damaged return into a DAMAGED warehouse they aren't assigned to (Q2)", async () => {
    const damaged = (await makeWarehouse("DAMAGED")).id;
    const staff = actorOf(await makeUser("STAFF", [riyadh]));
    const input: EntryInput = {
      direction: "IN",
      reason: "CUSTOMER_RETURN",
      returnCondition: "DAMAGED",
      warehouseId: damaged,
      customerName: "Khalid",
      lines: [{ productId: p1, quantity: 1 }],
    };
    await expect(createEntry(testDb, staff, input)).resolves.toMatchObject({ number: "IN-000001" });
    // …but resellable goods can't be put into a damaged warehouse, nor damaged ones into a sellable one
    await expect(createEntry(testDb, staff, { ...input, returnCondition: "RESELLABLE" })).rejects.toMatchObject({
      key: "stock.errors.returnWarehouseKind",
    });
    await expect(createEntry(testDb, staff, { ...input, warehouseId: riyadh })).rejects.toMatchObject({
      key: "stock.errors.returnWarehouseKind",
    });
  });
});
