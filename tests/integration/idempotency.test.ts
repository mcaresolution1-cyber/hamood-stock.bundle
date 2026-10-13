/** P0: a repeated submit (double click, slow connection, automatic retry) never creates a second entry. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createEntry, type EntryInput } from "@/server/stock/createEntry";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { expectLedgerMatchesLevels, level } from "../helpers/ledger";

let admin: { id: string; role: "ADMIN"; warehouseIds: string[] };
let other: { id: string; role: "ADMIN"; warehouseIds: string[] };
let main: string;
let jeddah: string;
let p: string;

beforeEach(async () => {
  await resetDatabase();
  main = (await makeWarehouse("SELLABLE", "Riyadh Main")).id;
  jeddah = (await makeWarehouse("SELLABLE", "Jeddah")).id;
  admin = { id: (await makeUser("ADMIN")).id, role: "ADMIN", warehouseIds: [] };
  other = { id: (await makeUser("ADMIN")).id, role: "ADMIN", warehouseIds: [] };
  p = (await makeProduct("HMD-772")).id;
  await createEntry(testDb, admin, { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouseId: main, lines: [{ productId: p, quantity: 10 }] });
});
afterAll(() => testDb.$disconnect());

const sale = (key: string, quantity = 2): EntryInput => ({
  direction: "OUT",
  reason: "WEBSITE_ORDER",
  warehouseId: main,
  reference: "WC-1",
  lines: [{ productId: p, quantity }],
  idempotencyKey: key,
});

describe("idempotent saves", () => {
  it("a repeated submit returns the entry already saved and moves stock once", async () => {
    const first = await createEntry(testDb, admin, sale("key-aaaa-1111"));
    const again = await createEntry(testDb, admin, sale("key-aaaa-1111"));
    expect(again).toEqual(first);
    expect(await level(p, main)).toBe(8);
    expect(await testDb.stockEntry.count({ where: { type: "OUT" } })).toBe(1);
    await expectLedgerMatchesLevels();
  });

  it("two submits with the same key at the same moment create exactly one entry", async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => createEntry(testDb, admin, sale("key-bbbb-2222"))));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await level(p, main)).toBe(8);
    expect(await testDb.stockEntry.count({ where: { type: "OUT" } })).toBe(1);
    await expectLedgerMatchesLevels();
  });

  it("different keys are different entries; no key keeps the old behaviour", async () => {
    await createEntry(testDb, admin, sale("key-cccc-3333"));
    await createEntry(testDb, admin, sale("key-dddd-4444"));
    await createEntry(testDb, admin, { ...sale("x"), idempotencyKey: undefined });
    expect(await level(p, main)).toBe(4);
  });

  it("a repeated transfer returns both halves", async () => {
    const input: EntryInput = { direction: "OUT", reason: "TRANSFER", warehouseId: main, destinationWarehouseId: jeddah, lines: [{ productId: p, quantity: 3 }], idempotencyKey: "key-eeee-5555" };
    const first = await createEntry(testDb, admin, input);
    const again = await createEntry(testDb, admin, input);
    expect(again).toEqual(first);
    expect(again.linked?.number).toMatch(/-IN$/);
    expect([await level(p, main), await level(p, jeddah)]).toEqual([7, 3]);
  });

  it("someone else's key is refused, not returned", async () => {
    await createEntry(testDb, admin, sale("key-ffff-6666"));
    await expect(createEntry(testDb, other, sale("key-ffff-6666"))).rejects.toMatchObject({ key: "stock.errors.duplicateSubmit" });
  });
});
