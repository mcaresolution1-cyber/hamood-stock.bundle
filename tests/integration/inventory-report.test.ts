/** Plan ux-dashboard-report: the dashboard movement chart and the inventory report numbers (PX1–PX3). */
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const messages = { en: (await import("../../messages/en.json")).default, ar: (await import("../../messages/ar.json")).default };
  return {
    getLocale: async () => "en",
    getTranslations: async (o?: string | { locale: "en" | "ar"; namespace?: string }) =>
      typeof o === "object"
        ? createTranslator({ locale: o.locale, messages: messages[o.locale], namespace: o.namespace as never })
        : createTranslator({ locale: "en", messages: messages.en, namespace: o as never }),
  };
});

import { createEntry } from "@/server/stock/createEntry";
import { voidEntry } from "@/server/stock/voidEntry";
import { inventoryReport, movementByDay, movementByProduct, stockMovement } from "@/server/queries/inventory";
import { loadStockMovement } from "@/server/actions/dashboard";
import { GET as reportExport } from "@/app/print/report/export/route";
import { riyadhDay } from "@/lib/stock/days";
import type { Role } from "@/generated/prisma/enums";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { signInAs } from "../helpers/auth";

type User = Awaited<ReturnType<typeof makeUser>>;
const actor = (u: User) => ({ id: u.id, role: u.role as Role, warehouseIds: u.warehouses.map((w) => w.id) });
let admin: User;
let a: string;
let b: string;
let p1: string;
let p2: string;

/** Entries can't be back-dated in the app; tests move one to a past moment directly. */
async function at(entry: { id: string }, iso: string) {
  // rules-allow: ledger-mutation — test fixture: only moves the entry's date into the past, never quantities
  await testDb.$executeRaw`UPDATE \`StockEntry\` SET entryDate = ${new Date(iso)} WHERE id = ${entry.id} OR linkedEntryId = ${entry.id}`;
}
const stockIn = (w: string, productId: string, quantity: number, reason: "SUPPLIER_DELIVERY" | "OPENING_STOCK" = "SUPPLIER_DELIVERY") =>
  createEntry(testDb, actor(admin), { direction: "IN", reason, warehouseId: w, supplierName: "x", reference: "INV", lines: [{ productId, quantity }] });
const stockOut = (w: string, productId: string, quantity: number) =>
  createEntry(testDb, actor(admin), { direction: "OUT", reason: "WEBSITE_ORDER", warehouseId: w, reference: "10001", lines: [{ productId, quantity }] });

beforeEach(async () => {
  await resetDatabase();
  admin = await makeUser("ADMIN");
  a = (await makeWarehouse("SELLABLE", "A")).id;
  b = (await makeWarehouse("SELLABLE", "B")).id;
  p1 = (await makeProduct("HMD-1")).id;
  p2 = (await makeProduct("HMD-2")).id;
});
afterAll(() => testDb.$disconnect());

/** Builds: opening 100 (Oct 1), in 10 (Oct 2, 23:30 Riyadh), out 4 (Oct 3), transfer 5 A→B (Oct 3), a voided in 7 (Oct 3). */
async function story() {
  await at(await stockIn(a, p1, 100, "OPENING_STOCK"), "2026-10-01T08:00:00+03:00");
  await at(await stockIn(a, p1, 10), "2026-10-02T23:30:00+03:00"); // still Oct 2 in Riyadh (20:30 UTC)
  await at(await stockOut(a, p1, 4), "2026-10-03T10:00:00+03:00");
  const trf = await createEntry(testDb, actor(admin), { direction: "OUT", reason: "TRANSFER", warehouseId: a, destinationWarehouseId: b, lines: [{ productId: p1, quantity: 5 }] });
  await at(trf, "2026-10-03T11:00:00+03:00");
  const wrong = await stockIn(a, p2, 7);
  await at(wrong, "2026-10-03T12:00:00+03:00");
  const v = await voidEntry(testDb, actor(admin), { entryId: wrong.id, reason: "typo" });
  await at({ id: v.voids[0].id }, "2026-10-03T13:00:00+03:00");
}

describe("movement by day (dashboard chart)", () => {
  it("buckets Riyadh days, leaves out opening stock, voids, and transfers across all warehouses; zero days included", async () => {
    await story();
    const all = await movementByDay({ from: "2026-10-01", to: "2026-10-04", includeOpening: false });
    expect(all).toEqual([
      { day: "2026-10-01", in: 0, out: 0 },
      { day: "2026-10-02", in: 10, out: 0 },
      { day: "2026-10-03", in: 0, out: 4 },
      { day: "2026-10-04", in: 0, out: 0 },
    ]);
    expect((await movementByDay({ from: "2026-10-01", to: "2026-10-01", includeOpening: true }))[0]).toEqual({ day: "2026-10-01", in: 100, out: 0 });
    // One warehouse: the transfer counts
    expect((await movementByDay({ from: "2026-10-03", to: "2026-10-03", warehouseId: a, includeOpening: false }))[0]).toEqual({ day: "2026-10-03", in: 0, out: 9 });
    expect((await movementByDay({ from: "2026-10-03", to: "2026-10-03", warehouseId: b, includeOpening: false }))[0]).toEqual({ day: "2026-10-03", in: 5, out: 0 });
  });

  it("the action needs stock:view and returns the last N days ending today", async () => {
    await stockIn(a, p1, 3);
    signInAs(admin);
    const r = await loadStockMovement({ days: 7, warehouseId: "", includeOpening: false });
    expect(r).toMatchObject({ ok: true });
    const data = (r as { data: { day: string; in: number }[] }).data;
    expect(data).toHaveLength(7);
    expect(data.at(-1)).toEqual({ day: riyadhDay(new Date()), in: 3, out: 0 });
    expect(await loadStockMovement({ days: 8 })).toMatchObject({ ok: false });
    signInAs(await makeUser("TECHNICIAN"));
    expect(await loadStockMovement({ days: 7 })).toMatchObject({ ok: false, error: "errors.forbidden" });
    expect(await stockMovement({ days: 30 })).toHaveLength(30);
  });
});

describe("inventory report", () => {
  it("opening / in / out / closing per product from movements, so a past range is right; opening + in − out = closing", async () => {
    await story();
    await stockOut(a, p1, 50); // today: must not change a report for October 2–3
    const rows = await movementByProduct({ from: "2026-10-02", to: "2026-10-03", includeOpening: true });
    expect(rows.map((r) => [r.modelCode, r.opening, r.in, r.out, r.closing])).toEqual([["HMD-1", 100, 10, 4, 106]]);
    const inA = await movementByProduct({ from: "2026-10-02", to: "2026-10-03", warehouseId: a, includeOpening: true });
    expect(inA.map((r) => [r.opening, r.in, r.out, r.closing])).toEqual([[100, 10, 9, 101]]);
    // show all: products without anything appear with zeros
    const all = await movementByProduct({ from: "2026-10-02", to: "2026-10-03", includeOpening: true }, { showAll: true });
    expect(all.map((r) => [r.modelCode, r.closing])).toEqual([["HMD-1", 106], ["HMD-2", 0]]);
  });

  it("a transfer whose halves fall either side of midnight doesn't skew the all-warehouses balance", async () => {
    await at(await stockIn(a, p1, 20), "2026-10-01T09:00:00+03:00");
    const trf = await createEntry(testDb, actor(admin), { direction: "OUT", reason: "TRANSFER", warehouseId: a, destinationWarehouseId: b, lines: [{ productId: p1, quantity: 5 }] });
    // rules-allow: ledger-mutation — test fixture: only moves the two halves' dates, never quantities
    await testDb.$executeRaw`UPDATE \`StockEntry\` SET entryDate = ${new Date("2026-10-01T23:59:59+03:00")} WHERE id = ${trf.id}`;
    // rules-allow: ledger-mutation — test fixture: only moves the two halves' dates, never quantities
    await testDb.$executeRaw`UPDATE \`StockEntry\` SET entryDate = ${new Date("2026-10-02T00:00:01+03:00")} WHERE linkedEntryId = ${trf.id} AND type = 'TRANSFER_IN'`;
    const all = await movementByProduct({ from: "2026-10-02", to: "2026-10-02", includeOpening: true });
    expect(all.map((r) => [r.opening, r.in, r.out, r.closing])).toEqual([[20, 0, 0, 20]]);
    const inB = await movementByProduct({ from: "2026-10-02", to: "2026-10-02", warehouseId: b, includeOpening: true });
    expect(inB.map((r) => [r.opening, r.in, r.out, r.closing])).toEqual([[0, 5, 0, 5]]);
  });

  it("summary, days, lines and the Excel workbook agree", async () => {
    await story();
    const r = await inventoryReport({ from: "2026-10-01", to: "2026-10-03", showAll: false });
    expect(r.summary).toEqual({ opening: 0, in: 110, out: 4, closing: 106, entries: 3 });
    expect(r.days.reduce((s, d) => s + d.in - d.out, 0)).toBe(r.summary.closing - r.summary.opening);
    expect(r.lines.rows.map((l) => [l.number.slice(0, 3), l.quantity])).toEqual([
      ["IN-", 100],
      ["IN-", 10],
      ["OUT", -4],
    ]);
    // an unknown warehouse id means "all", not an empty report
    expect((await inventoryReport({ from: "2026-10-01", to: "2026-10-03", warehouseId: "nope", showAll: false })).summary.closing).toBe(106);

    signInAs(admin);
    const res = await reportExport(new Request("http://x/print/report/export?from=2026-10-01&to=2026-10-03&lang=ar"));
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["الملخص", "الحركة اليومية", "المنتجات", "الحركات"]);
    expect(wb.worksheets[0].views[0]).toMatchObject({ rightToLeft: true });
    const summary = wb.worksheets[0];
    expect(String(summary.getCell("A1").value)).toContain("Hamood TV Stands");
    expect(summary.getCell("B5").value).toBe(0); // opening
    expect(summary.getCell("B8").value).toBe(106); // closing

    signInAs(await makeUser("TECHNICIAN"));
    expect((await reportExport(new Request("http://x/print/report/export"))).status).toBe(403);
  });
});
