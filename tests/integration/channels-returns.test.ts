/** Plan channels-returns: Noon / Amazon orders, return reasons, and resellable / broken / trashed returns. */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { findRepeatedOrder, saveEntry, voidEntryAction } from "@/server/actions/entries";
import { emptyEntryForm } from "@/lib/validation/entries";
import { getEntry } from "@/server/queries/entries";
import { createEntry } from "@/server/stock/createEntry";
import { movementByProduct } from "@/server/queries/inventory";
import { riyadhDay } from "@/lib/stock/days";
import type { Role } from "@/generated/prisma/enums";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { expectLedgerMatchesLevels, level } from "../helpers/ledger";
import { signInAs } from "../helpers/auth";

type User = Awaited<ReturnType<typeof makeUser>>;
const actor = (u: User) => ({ id: u.id, role: u.role as Role, warehouseIds: u.warehouses.map((w) => w.id) });
let main: string;
let damaged: string;
let p1: string;
let admin: User;
let staff: User;

const order = (reason: "NOON_ORDER" | "AMAZON_ORDER", reference: string, qty = "3") => ({
  ...emptyEntryForm("OUT"),
  reason,
  warehouseId: main,
  reference,
  lines: [{ productId: p1, quantity: qty }],
});
const customerReturn = (reference: string, returnCondition: string, warehouseId: string, qty = "1") => ({
  ...emptyEntryForm("IN"),
  reason: "CUSTOMER_RETURN",
  returnCondition,
  // Noon numbers here start with letters, Amazon ones with digits
  salesChannel: /^\d/.test(reference) ? "AMAZON" : "NOON",
  warehouseId,
  reference,
  reasonCode: "DEFECTIVE",
  lines: [{ productId: p1, quantity: qty }],
});
type Saved = { id: string; number: string; writeOff?: { id: string; number: string } };
const saved = (r: unknown) => {
  expect(r, JSON.stringify(r)).toMatchObject({ ok: true, data: { status: "saved" } });
  return (r as { data: { entry: Saved } }).data.entry;
};

beforeEach(async () => {
  await resetDatabase();
  main = (await makeWarehouse("SELLABLE", "Riyadh Main")).id;
  damaged = (await makeWarehouse("DAMAGED", "Damaged Stock")).id;
  p1 = (await makeProduct("HMD-772")).id;
  admin = await makeUser("ADMIN");
  staff = await makeUser("STAFF", [main]); // not assigned to the damaged-stock warehouse
  await createEntry(testDb, actor(admin), { direction: "IN", reason: "OPENING_STOCK", warehouseId: main, lines: [{ productId: p1, quantity: 20 }] });
});
afterAll(() => testDb.$disconnect());

describe("Noon and Amazon orders", () => {
  it("are sales with a normalised order number, a repeat warning, and only from sellable warehouses", async () => {
    signInAs(staff);
    const noon = saved(await saveEntry(order("NOON_ORDER", " nae 1234567 ")));
    const amazon = saved(await saveEntry(order("AMAZON_ORDER", "171-1234567-1234567", "2")));
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: noon.id } })).toMatchObject({ type: "OUT", reason: "NOON_ORDER", reference: "NAE1234567" });
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: amazon.id } })).toMatchObject({ reason: "AMAZON_ORDER", reference: "171-1234567-1234567" });
    expect(await level(p1, main)).toBe(15);

    expect(await findRepeatedOrder({ reason: "NOON_ORDER", reference: "NAE 1234567" })).toEqual({ ok: true, data: { id: noon.id, number: noon.number } });
    // Same number on another channel is not a repeat
    expect(await findRepeatedOrder({ reason: "AMAZON_ORDER", reference: "NAE1234567" })).toEqual({ ok: true, data: null });
    expect(await saveEntry(order("NOON_ORDER", "??"))).toMatchObject({ ok: false, fieldErrors: { reference: "entryForm.errors.marketplaceOrder" } });

    signInAs(admin);
    expect(await saveEntry({ ...order("AMAZON_ORDER", "171-1"), warehouseId: damaged })).toMatchObject({ ok: false, error: "stock.errors.reasonNotForWarehouse" });

    // Reports pick them up as stock out
    const [row] = await movementByProduct({ from: riyadhDay(new Date()), to: riyadhDay(new Date()), includeOpening: false });
    expect(row).toMatchObject({ out: 5, closing: 15 });
    await expectLedgerMatchesLevels();
  });

  it("a customer return finds the Noon / Amazon sale by its order number and can't return more than was sold", async () => {
    signInAs(staff);
    const noon = saved(await saveEntry(order("NOON_ORDER", "NAE1234567")));
    const ret = saved(await saveEntry(customerReturn("nae 1234567", "RESELLABLE", main, "2")));
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: ret.id } })).toMatchObject({
      originalEntryId: noon.id,
      reference: "NAE1234567",
      itemCondition: "RESELLABLE",
    });
    expect(await saveEntry(customerReturn("NAE1234567", "RESELLABLE", main, "2"))).toMatchObject({ ok: false, error: "returns.errors.tooMany" });

    saved(await saveEntry(order("AMAZON_ORDER", "171-1234567-1234567", "1")));
    expect(await saveEntry(customerReturn("171-1234567-1234567", "BROKEN", damaged))).toMatchObject({ ok: true });
    expect((await getEntry(noon.id))?.returns).toEqual([{ id: ret.id, number: ret.number }]);
  });
});

describe("returned item condition", () => {
  it("resellable goes to a sellable warehouse, broken to any warehouse, trashed to a damaged one", async () => {
    signInAs(admin);
    saved(await saveEntry({ ...order("NOON_ORDER", "NAE1"), reference: "NAE100", lines: [{ productId: p1, quantity: "5" }] }));
    expect(await saveEntry(customerReturn("NAE100", "RESELLABLE", damaged))).toMatchObject({ ok: false, error: "stock.errors.returnWarehouseKind" });
    expect(await saveEntry(customerReturn("NAE100", "TRASHED", main))).toMatchObject({ ok: false, error: "stock.errors.returnWarehouseKind" });
    const broken = saved(await saveEntry(customerReturn("NAE100", "BROKEN", damaged)));
    expect(await level(p1, damaged)).toBe(1);
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: broken.id } })).toMatchObject({ itemCondition: "BROKEN" });
    expect(broken.writeOff).toBeUndefined();
    // Broken may also go back into a sellable warehouse (owner, 2026-10-23)
    const intoMain = saved(await saveEntry(customerReturn("NAE100", "BROKEN", main)));
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: intoMain.id } })).toMatchObject({ itemCondition: "BROKEN", warehouseId: main });
    await expectLedgerMatchesLevels();
  });

  it("trashed: the return is written off at once (even by staff, without approval), and voiding either voids both", async () => {
    signInAs(staff);
    const sale = saved(await saveEntry({ ...order("NOON_ORDER", "NAE200"), lines: [{ productId: p1, quantity: "4" }] }));
    const ret = saved(await saveEntry(customerReturn("NAE200", "TRASHED", damaged, "2")));
    expect(ret.writeOff?.number).toMatch(/^OUT-\d{6}$/);
    expect(await level(p1, damaged)).toBe(0);
    const writeOff = await testDb.stockEntry.findUniqueOrThrow({ where: { id: ret.writeOff!.id }, include: { lines: true } });
    expect(writeOff).toMatchObject({ type: "OUT", reason: "DAMAGED_LOST", reasonCode: "RETURNED_TRASHED", originalEntryId: ret.id, warehouseId: damaged, createdById: staff.id });
    expect(writeOff.lines.map((l) => [l.productId, l.quantity])).toEqual([[p1, 2]]);
    await expectLedgerMatchesLevels();

    const detail = (await getEntry(ret.id))!;
    expect(detail).toMatchObject({ itemCondition: "TRASHED", writeOffs: [ret.writeOff], returns: [] });
    expect((await getEntry(writeOff.id))?.originalEntry).toEqual({ id: ret.id, number: ret.number });
    expect((await getEntry(sale.id))?.returns).toEqual([{ id: ret.id, number: ret.number }]); // not the write-off
    // Counts as returned: only 2 more of the 4 sold may come back
    expect(await saveEntry(customerReturn("NAE200", "RESELLABLE", main, "3"))).toMatchObject({ ok: false, error: "returns.errors.tooMany" });

    // Void the write-off → the return goes too, stock stays as it was
    signInAs(admin);
    const v = await voidEntryAction({ entryId: writeOff.id, reason: "wrong condition" });
    expect(v).toMatchObject({ ok: true, data: { status: "voided" } });
    expect((v as { data: { result: { voids: unknown[] } } }).data.result.voids).toHaveLength(2);
    expect((await testDb.stockEntry.findMany({ where: { id: { in: [ret.id, writeOff.id] } } })).every((e) => e.voidedAt)).toBe(true);
    expect(await level(p1, damaged)).toBe(0);
    await expectLedgerMatchesLevels();

    // The voided return no longer counts: 4 may come back now
    signInAs(staff);
    const again = saved(await saveEntry(customerReturn("NAE200", "TRASHED", damaged, "4")));
    signInAs(admin);
    expect(await voidEntryAction({ entryId: again.id, reason: "typo again" })).toMatchObject({ ok: true });
    expect(await testDb.stockEntry.count({ where: { id: { in: [again.id, again.writeOff!.id] }, voidedAt: { not: null } } })).toBe(2);
    await expectLedgerMatchesLevels();
  });

  it("a trashed return still counts in the damaged warehouse's movement report as in and out", async () => {
    signInAs(admin);
    saved(await saveEntry(order("AMAZON_ORDER", "171-200")));
    saved(await saveEntry(customerReturn("171-200", "TRASHED", damaged, "1")));
    const today = riyadhDay(new Date());
    const [row] = await movementByProduct({ from: today, to: today, warehouseId: damaged, includeOpening: false });
    expect(row).toMatchObject({ in: 1, out: 1, closing: 0 });
  });
});

describe("sold through (website / showroom / Noon / Amazon)", () => {
  it("a return is matched only against sales of the chosen channel, and the channel is stored", async () => {
    signInAs(admin);
    const web = saved(await saveEntry({ ...order("NOON_ORDER", "x"), reason: "WEBSITE_ORDER", reference: "12345", lines: [{ productId: p1, quantity: "2" }] }));
    const amazon = saved(await saveEntry(order("AMAZON_ORDER", "12345", "1"))); // same number, other channel
    const shop = saved(
      await saveEntry({
        ...emptyEntryForm("OUT"),
        reason: "DIRECT_SALE",
        warehouseId: main,
        customerName: "Walk-in",
        customerPhone: "0501234567",
        paymentMethod: "CASH",
        reference: "R-77",
        lines: [{ productId: p1, quantity: "1" }],
      }),
    );
    const ret = (channel: string, reference: string, qty = "1") => ({ ...customerReturn(reference, "RESELLABLE", main, qty), salesChannel: channel });

    // Website: only the website order is found, so the return is linked to it and limited to its 2 units
    const r1 = saved(await saveEntry(ret("WEBSITE", "#12 345", "2")));
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: r1.id } })).toMatchObject({ salesChannel: "WEBSITE", originalEntryId: web.id, reference: "12345" });
    // Amazon: the Amazon sale with the same number is separate
    const r2 = saved(await saveEntry(ret("AMAZON", "12345")));
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: r2.id } })).toMatchObject({ salesChannel: "AMAZON", originalEntryId: amazon.id });
    // Showroom: by receipt no. or the sale's entry no.; not found on another channel
    expect(await saveEntry(ret("NOON", "R-77"))).toMatchObject({ ok: false, error: "returns.errors.noSale" });
    const r3 = saved(await saveEntry(ret("SHOWROOM", "r-77")));
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: r3.id } })).toMatchObject({ salesChannel: "SHOWROOM", originalEntryId: shop.id });
    expect(await saveEntry(ret("SHOWROOM", shop.number))).toMatchObject({ ok: false, error: "returns.errors.tooMany" });
    expect(await saveEntry(ret("WEBSITE", shop.number))).toMatchObject({ ok: false, error: "returns.errors.noSale" });
    expect((await getEntry(r3.id))?.salesChannel).toBe("SHOWROOM");
    await expectLedgerMatchesLevels();
  });
});
