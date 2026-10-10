import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveEntry, voidEntryAction } from "@/server/actions/entries";
import { uploadAttachment } from "@/server/actions/attachments";
import { GET as getAttachment } from "@/app/api/attachments/[id]/route";
import { emptyEntryForm } from "@/lib/validation/entries";
import { loadEntryForm } from "@/server/queries/entry-form";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { level } from "../helpers/ledger";
import { signInAs } from "../helpers/auth";

let main: string;
let other: string;
let p1: string;
let staff: Awaited<ReturnType<typeof makeUser>>;
let admin: Awaited<ReturnType<typeof makeUser>>;

const delivery = (warehouseId: string, extra = {}) => ({
  ...emptyEntryForm("IN"),
  reason: "SUPPLIER_DELIVERY",
  warehouseId,
  supplierName: "Acme",
  reference: "INV-1",
  lines: [{ productId: p1, quantity: "5" }],
  ...extra,
});
const png = (bytes = 100, type = "image/png") => {
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(bytes)], "x.png", { type }));
  return fd;
};

beforeEach(async () => {
  await resetDatabase();
  main = (await makeWarehouse("SELLABLE", "Riyadh Main")).id;
  other = (await makeWarehouse("SELLABLE", "Jeddah")).id;
  p1 = (await makeProduct("HMD-772")).id;
  staff = await makeUser("STAFF", [main]);
  admin = await makeUser("ADMIN");
});
afterAll(() => testDb.$disconnect());

describe("saveEntry", () => {
  it("saves a valid STAFF delivery and drops fields the reason doesn't use", async () => {
    signInAs(staff);
    const result = await saveEntry(delivery(main, { technicianName: "should be dropped", customerName: "dropped" }));
    expect(result).toMatchObject({ ok: true, data: { number: "IN-000001" } });
    const e = await testDb.stockEntry.findFirstOrThrow();
    expect(e).toMatchObject({ supplierName: "Acme", reference: "INV-1", technicianName: null, customerName: null, createdById: staff.id });
    expect(await level(p1, main)).toBe(5);
  });

  it("rejects STAFF in an unassigned warehouse, and VIEWER entirely", async () => {
    signInAs(staff);
    expect(await saveEntry(delivery(other))).toEqual({ ok: false, error: "stock.errors.warehouseNotAssigned", params: {} });
    signInAs(await makeUser("VIEWER", [main]));
    expect(await saveEntry(delivery(main))).toEqual({ ok: false, error: "errors.forbidden" });
    expect(await testDb.stockEntry.count()).toBe(0);
  });

  it("returns field errors from the shared schema", async () => {
    signInAs(staff);
    const result = await saveEntry({ ...delivery(main), supplierName: "", lines: [] });
    expect(result).toMatchObject({ ok: false, fieldErrors: { supplierName: "validation.required", lines: "stock.errors.noLines" } });
  });

  it("returns the 'only N left' message for a stock out", async () => {
    signInAs(admin);
    await saveEntry(delivery(main));
    const result = await saveEntry({
      ...emptyEntryForm("OUT"),
      reason: "WEBSITE_ORDER",
      warehouseId: main,
      reference: "WC-1",
      lines: [{ productId: p1, quantity: "6" }],
    });
    expect(result).toEqual({
      ok: false,
      error: "stock.errors.insufficient",
      params: { available: 5, modelCode: "HMD-772", warehouse: "Riyadh Main" },
    });
  });

  it("only accepts a photo the same user uploaded", async () => {
    signInAs(admin);
    const upload = await uploadAttachment(png());
    expect(upload).toMatchObject({ ok: true, data: { url: expect.stringMatching(/^\/api\/attachments\//) } });
    const url = (upload as { data: { url: string } }).data.url;

    signInAs(staff); // someone else's photo
    expect(await saveEntry(delivery(main, { photoUrl: url }))).toMatchObject({ ok: false, error: "validation.photo" });
    signInAs(admin);
    expect(await saveEntry(delivery(main, { photoUrl: url }))).toMatchObject({ ok: true });
    expect((await testDb.stockEntry.findFirstOrThrow()).photoUrl).toBe(url);
  });
});

describe("photos", () => {
  it("rejects non-images and files over 4 MB, and VIEWER uploads", async () => {
    signInAs(staff);
    expect(await uploadAttachment(png(100, "application/pdf"))).toMatchObject({ ok: false, error: "photo.errors.type" });
    expect(await uploadAttachment(png(4 * 1024 * 1024 + 1))).toMatchObject({ ok: false, error: "photo.errors.tooBig" });
    signInAs(await makeUser("VIEWER"));
    expect(await uploadAttachment(png())).toEqual({ ok: false, error: "errors.forbidden" });
  });

  it("serves photos only to signed-in users", async () => {
    signInAs(staff);
    const url = ((await uploadAttachment(png(10))) as { data: { url: string } }).data.url;
    const id = url.split("/").pop()!;
    const ctx = { params: Promise.resolve({ id }) } as Parameters<typeof getAttachment>[1];
    const ok = await getAttachment(new Request("http://x"), ctx);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    signInAs(null);
    expect((await getAttachment(new Request("http://x"), ctx)).status).toBe(401);
  });
});

describe("voidEntryAction", () => {
  it("is ADMIN only and needs a reason", async () => {
    signInAs(admin);
    const saved = await saveEntry(delivery(main));
    const id = (saved as { data: { id: string } }).data.id;
    signInAs(staff);
    expect(await voidEntryAction({ entryId: id, reason: "mistake" })).toEqual({ ok: false, error: "errors.forbidden" });
    signInAs(admin);
    expect(await voidEntryAction({ entryId: id, reason: "" })).toMatchObject({
      ok: false,
      fieldErrors: { reason: "void.errors.reasonRequired" },
    });
    expect(await voidEntryAction({ entryId: id, reason: "mistake" })).toMatchObject({ ok: true, data: { voids: [{ number: "VOID-000001" }] } });
    expect(await level(p1, main)).toBe(0);
  });
});

describe("entry form data", () => {
  it("never includes cost and marks only assigned warehouses writable for STAFF", async () => {
    await testDb.product.update({ where: { id: p1 }, data: { cost: "85.00" } });
    const user = { id: staff.id, name: staff.name, email: staff.email, role: staff.role, warehouseIds: [main] };
    const data = await loadEntryForm(user, "OUT");
    expect(JSON.stringify(data)).not.toContain("cost");
    expect(JSON.stringify(data)).not.toContain("85");
    expect(data.warehouses.map((w) => [w.name, w.writable])).toEqual([
      ["Jeddah", false],
      ["Riyadh Main", true],
    ]);
    expect(data.reasons).toEqual(["WEBSITE_ORDER", "DIRECT_SALE", "INSTALLATION", "TRANSFER"]);
  });
});
