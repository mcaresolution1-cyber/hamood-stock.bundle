import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createEntry } from "@/server/stock/createEntry";
import { voidEntry } from "@/server/stock/voidEntry";
import { getEntry, listEntries, relatedEntries } from "@/server/queries/entries";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";

let admin: { id: string; role: "ADMIN"; warehouseIds: string[] };
let staff: { id: string; role: "STAFF"; warehouseIds: string[] };
let main: string;
let jeddah: string;
let p: string;

beforeEach(async () => {
  await resetDatabase();
  main = (await makeWarehouse("SELLABLE", "Riyadh Main")).id;
  jeddah = (await makeWarehouse("SELLABLE", "Jeddah")).id;
  const a = await makeUser("ADMIN");
  const s = await makeUser("STAFF", [main]);
  await testDb.user.update({ where: { id: a.id }, data: { name: "Admin Ali" } });
  await testDb.user.update({ where: { id: s.id }, data: { name: "Staff Sami" } });
  admin = { id: a.id, role: "ADMIN", warehouseIds: [] };
  staff = { id: s.id, role: "STAFF", warehouseIds: [main] };
  p = (await makeProduct("HMD-772")).id;
});
afterAll(() => testDb.$disconnect());

describe("entry audit trail", () => {
  it("shows who created an entry, who voided it, when, and why; the VOID links back", async () => {
    const e = await createEntry(testDb, staff, { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouseId: main, supplierName: "S", lines: [{ productId: p, quantity: 5 }] });
    await voidEntry(testDb, admin, { entryId: e.id, reason: "wrong supplier" });

    const original = (await getEntry(e.id))!;
    expect(original.createdBy.name).toBe("Staff Sami");
    expect(original.createdAt).toBeInstanceOf(Date);
    expect(original.voidedBy?.name).toBe("Admin Ali");
    expect(original.voidedAt).toBeInstanceOf(Date);
    const rel = relatedEntries(original);
    expect(rel.voidEntry?.note).toBe("wrong supplier");

    const voidRow = (await getEntry(rel.voidEntry!.id))!;
    expect(voidRow.type).toBe("VOID");
    expect(voidRow.createdBy.name).toBe("Admin Ali");
    expect(relatedEntries(voidRow).reverses?.id).toBe(e.id);

    const list = await listEntries({});
    expect(list.rows.map((r) => [r.type, r.createdBy.name, Boolean(r.voidedAt)])).toEqual(
      expect.arrayContaining([
        ["IN", "Staff Sami", true],
        ["VOID", "Admin Ali", false],
      ]),
    );
  });

  it("links both halves of a transfer, and a voided transfer shows its void on each half", async () => {
    await createEntry(testDb, admin, { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouseId: main, supplierName: "S", lines: [{ productId: p, quantity: 5 }] });
    const out = await createEntry(testDb, staff, { direction: "OUT", reason: "TRANSFER", warehouseId: main, destinationWarehouseId: jeddah, lines: [{ productId: p, quantity: 2 }] });
    const outRow = (await getEntry(out.id))!;
    const inId = relatedEntries(outRow).transferIn!.id;
    expect(relatedEntries((await getEntry(inId))!).transferOut?.id).toBe(out.id);

    await voidEntry(testDb, admin, { entryId: out.id, reason: "typo" });
    for (const id of [out.id, inId]) {
      const row = (await getEntry(id))!;
      expect(row.voidedBy?.name).toBe("Admin Ali");
      expect(relatedEntries(row).voidEntry?.note).toBe("typo");
    }
  });
});
