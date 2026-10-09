import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { applyOpeningStock, previewOpeningStock } from "@/server/actions/opening-stock";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { expectLedgerMatchesLevels, level } from "../helpers/ledger";
import { signInAs } from "../helpers/auth";

let wh: string;
let p1: string;
let p2: string;

const form = (csv: string, extra: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("file", new File([csv], "count.csv"));
  fd.set("warehouseId", wh);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
};

beforeEach(async () => {
  await resetDatabase();
  signInAs(await makeUser("ADMIN"));
  wh = (await makeWarehouse("SELLABLE", "Riyadh Main")).id;
  p1 = (await makeProduct("HMD-772")).id;
  p2 = (await makeProduct("HMD-300")).id;
});
afterAll(() => testDb.$disconnect());

describe("opening stock", () => {
  it("saves exactly one IN / OPENING_STOCK entry through the entry service", async () => {
    const result = await applyOpeningStock(form("modelCode,quantity\nHMD-772,25\nhmd-300,40\n"));
    expect(result).toMatchObject({ ok: true, data: { number: "IN-000001" } });

    const entries = await testDb.stockEntry.findMany({ include: { lines: true } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "IN", reason: "OPENING_STOCK", warehouseId: wh });
    expect(entries[0].lines).toHaveLength(2);
    expect(await level(p1, wh)).toBe(25);
    expect(await level(p2, wh)).toBe(40);
    await expectLedgerMatchesLevels();
  });

  it("saves nothing when one row is bad", async () => {
    const result = await applyOpeningStock(form("modelCode,quantity\nHMD-772,25\nNOPE,1\n"));
    expect(result).toMatchObject({ ok: false, error: "import.errors.fixFirst" });
    expect(await testDb.stockEntry.count()).toBe(0);
    expect(await testDb.stockLevel.count()).toBe(0);
  });

  it("warns about earlier opening stock and needs confirmation to add more (Q6)", async () => {
    await applyOpeningStock(form("modelCode,quantity\nHMD-772,5\n"));

    const preview = await previewOpeningStock(form("modelCode,quantity\nHMD-772,5\n"));
    expect(preview).toMatchObject({ ok: true, data: { existing: [{ number: "IN-000001" }] } });

    expect(await applyOpeningStock(form("modelCode,quantity\nHMD-772,5\n"))).toMatchObject({
      ok: false,
      error: "openingStock.errors.confirmRequired",
    });
    expect(await applyOpeningStock(form("modelCode,quantity\nHMD-772,5\n", { confirmAdd: "yes" }))).toMatchObject({
      ok: true,
      data: { number: "IN-000002" },
    });
    expect(await level(p1, wh)).toBe(10);
  });

  it("lets only one of two simultaneous first uploads through without confirmation", async () => {
    const results = await Promise.all([
      applyOpeningStock(form("modelCode,quantity\nHMD-772,5\n")),
      applyOpeningStock(form("modelCode,quantity\nHMD-772,5\n")),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: "openingStock.errors.confirmRequired" });
    expect(await level(p1, wh)).toBe(5);
  });

  it("saves a file with more than 50 products as one entry", async () => {
    const codes = await Promise.all(Array.from({ length: 60 }, (_, i) => makeProduct(`BULK-${i}`)));
    const csv = ["modelCode,quantity", ...codes.map((p) => `${p.modelCode},1`)].join("\n");
    expect(await applyOpeningStock(form(csv))).toMatchObject({ ok: true });
    expect(await testDb.stockEntryLine.count()).toBe(60);
  });
});
