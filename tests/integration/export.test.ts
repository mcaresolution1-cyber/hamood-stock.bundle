import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Route handlers translate headers with next-intl; outside a Next request, use the real messages directly.
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const messages = (await import("../../messages/en.json")).default;
  return {
    getLocale: async () => "en",
    getTranslations: async (ns?: string) => createTranslator({ locale: "en", messages, namespace: ns as never }),
  };
});

import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { GET as stockOnHandGET } from "@/app/(app)/reports/stock-on-hand/export/route";
import { GET as movementsGET } from "@/app/(app)/reports/movements/export/route";
import { GET as lowStockGET } from "@/app/(app)/reports/low-stock/export/route";
import { GET as outByReasonGET } from "@/app/(app)/reports/out-by-reason/export/route";
import { createEntry } from "@/server/stock/createEntry";
import { movements } from "@/server/queries/reports";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { signInAs } from "../helpers/auth";

const req = (path: string) => new NextRequest(`http://localhost${path}`);
async function sheet(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("spreadsheetml");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await res.arrayBuffer()) as never);
  const ws = wb.worksheets[0];
  const rows: unknown[][] = [];
  ws.eachRow((r) => rows.push((r.values as unknown[]).slice(1)));
  return rows;
}

let admin: Awaited<ReturnType<typeof makeUser>>;
let staff: Awaited<ReturnType<typeof makeUser>>;

beforeEach(async () => {
  await resetDatabase();
  const wh = await makeWarehouse("SELLABLE", "Riyadh Main");
  admin = await makeUser("ADMIN");
  staff = await makeUser("STAFF", [wh.id]);
  const p = await makeProduct("HMD-772");
  const evil = await makeProduct("=HYPERLINK(1)");
  await testDb.product.update({ where: { id: p.id }, data: { cost: "85.50", lowStockLevel: 10 } });
  const actor = { id: admin.id, role: "ADMIN" as const, warehouseIds: [] };
  await createEntry(testDb, actor, { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouseId: wh.id, lines: [{ productId: p.id, quantity: 4 }, { productId: evil.id, quantity: 1 }] });
  await createEntry(testDb, actor, { direction: "OUT", reason: "WEBSITE_ORDER", reference: "WC-1", warehouseId: wh.id, lines: [{ productId: p.id, quantity: 1 }] });
});
afterAll(() => testDb.$disconnect());

describe("exports", () => {
  it("needs a signed-in user", async () => {
    signInAs(null);
    for (const get of [stockOnHandGET, movementsGET, lowStockGET, outByReasonGET]) {
      expect((await get(req("/x"))).status).toBe(401);
    }
  });

  it("gives ADMIN cost and value columns with exact amounts", async () => {
    signInAs(admin);
    const rows = await sheet(await stockOnHandGET(req("/reports/stock-on-hand/export")));
    expect(rows[0]).toEqual(["Model code", "Product", "Category", "Riyadh Main", "Total", "Unit cost", "Stock value"]);
    const hmd = rows.find((r) => r[0] === "HMD-772")!;
    expect(hmd.slice(3)).toEqual([3, 3, 85.5, 256.5]);
  });

  it("never gives STAFF cost or value", async () => {
    signInAs(staff);
    const rows = await sheet(await stockOnHandGET(req("/reports/stock-on-hand/export")));
    expect(rows[0]).toEqual(["Model code", "Product", "Category", "Riyadh Main", "Total"]);
    expect(JSON.stringify(rows)).not.toMatch(/85\.5|cost|value/i);
  });

  it("exports exactly the rows the movement report shows", async () => {
    signInAs(staff);
    const rows = await sheet(await movementsGET(req("/reports/movements/export")));
    const onScreen = await movements({});
    expect(rows.length - 1).toBe(onScreen.total);
    expect(rows.map((r) => r[7]).slice(1).sort()).toEqual(onScreen.rows.map((r) => r.quantity).sort());
  });

  it("writes formula-like text as a plain text cell, unchanged (decision B13)", async () => {
    signInAs(admin);
    const res = await stockOnHandGET(req("/reports/stock-on-hand/export"));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await res.arrayBuffer()) as never);
    const ws = wb.worksheets[0];
    let found = false;
    ws.eachRow((r) => {
      const c = r.getCell(1);
      if (c.value === "=HYPERLINK(1)") {
        found = true;
        expect(c.type).toBe(ExcelJS.ValueType.String);
        expect(c.formula).toBeUndefined();
      }
    });
    expect(found).toBe(true);
  });

  it("exports low stock and stock out by reason", async () => {
    signInAs(staff);
    const low = await sheet(await lowStockGET(req("/reports/low-stock/export")));
    expect(low[1]?.[0]).toBe("HMD-772");
    const out = await sheet(await outByReasonGET(req("/reports/out-by-reason/export")));
    expect(out[0][0]).toBe("Month");
    expect(out.some((r) => r.includes(1))).toBe(true);
  });
});
