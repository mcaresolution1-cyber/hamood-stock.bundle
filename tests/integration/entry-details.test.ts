/** Phase C1: entry details, line costs ("cost pending"), returns against the sale, supplier credit, photos. */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { findRepeatedOrder, saveEntry, voidEntryAction } from "@/server/actions/entries";
import { setLineCosts, setSupplierReturnCredit } from "@/server/actions/entry-details";
import { uploadAttachment } from "@/server/actions/attachments";
import { emptyEntryForm } from "@/lib/validation/entries";
import { getEntryMoney, listEntries } from "@/server/queries/entries";
import { averageCosts } from "@/server/stock/costs";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { level } from "../helpers/ledger";
import { signInAs } from "../helpers/auth";

let main: string;
let other: string;
let acme: string;
let p1: string;
let p2: string;
let admin: Awaited<ReturnType<typeof makeUser>>;
let manager: Awaited<ReturnType<typeof makeUser>>;
let staff: Awaited<ReturnType<typeof makeUser>>;

const delivery = (extra: Record<string, unknown> = {}) => ({
  ...emptyEntryForm("IN"),
  reason: "SUPPLIER_DELIVERY",
  warehouseId: main,
  supplierId: acme,
  reference: "INV-1",
  lines: [{ productId: p1, quantity: "10", unitCost: "" }],
  ...extra,
});
const sale = (reference: string, qty = "3", extra: Record<string, unknown> = {}) => ({
  ...emptyEntryForm("OUT"),
  reason: "WEBSITE_ORDER",
  warehouseId: main,
  reference,
  lines: [{ productId: p1, quantity: qty }],
  ...extra,
});
const customerReturn = (reference: string, qty = "1", extra: Record<string, unknown> = {}) => ({
  ...emptyEntryForm("IN"),
  reason: "CUSTOMER_RETURN",
  returnCondition: "RESELLABLE",
  salesChannel: "WEBSITE",
  warehouseId: main,
  reference,
  reasonCode: "CHANGED_MIND",
  lines: [{ productId: p1, quantity: qty }],
  ...extra,
});
const saved = (r: unknown) => (r as { data: { entry: { id: string; number: string } } }).data.entry;
const photo = async () => {
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(100)], "x.png", { type: "image/png" }));
  return (await uploadAttachment(fd) as { data: { url: string } }).data.url;
};

beforeEach(async () => {
  await resetDatabase();
  main = (await makeWarehouse("SELLABLE", "Riyadh Main")).id;
  other = (await makeWarehouse("SELLABLE", "Jeddah")).id;
  p1 = (await makeProduct("HMD-772")).id;
  p2 = (await makeProduct("HMD-300")).id;
  acme = (await testDb.supplier.create({ data: { nameEn: "Acme" } })).id;
  admin = await makeUser("ADMIN");
  manager = await makeUser("MANAGER", [main]);
  staff = await makeUser("STAFF", [main]);
});
afterAll(() => testDb.$disconnect());

describe("line costs and cost pending", () => {
  it("saves costs with a delivery, keeps the weighted average, and lists deliveries still missing a cost", async () => {
    signInAs(admin);
    await saveEntry(delivery({ lines: [{ productId: p1, quantity: "10", unitCost: "100" }] }));
    const second = saved(await saveEntry(delivery({ reference: "INV-2", lines: [{ productId: p1, quantity: "30", unitCost: "200" }, { productId: p2, quantity: "1", unitCost: "" }] })));
    expect((await averageCosts(testDb, [p1])).get(p1)?.toFixed(2)).toBe("175.00"); // (10×100 + 30×200) / 40
    expect(await testDb.productCost.count({ where: { productId: p1, source: "DELIVERY" } })).toBe(2);

    const pending = await listEntries({ costPending: "1" });
    expect(pending.rows.map((r) => [r.number, r.costPending])).toEqual([[second.number, true]]);

    // filled in later by the warehouse's manager
    signInAs(manager);
    const line = await testDb.stockEntryLine.findFirstOrThrow({ where: { entryId: second.id, productId: p2 } });
    expect(await setLineCosts({ entryId: second.id, costs: [{ lineId: line.id, unitCost: "55.5" }] })).toMatchObject({ ok: true });
    expect((await listEntries({ costPending: "1" })).rows).toEqual([]);
    expect((await getEntryMoney(second.id))?.lineCosts[line.id]).toMatchObject({ unitCost: "55.50", enteredBy: manager.name });
    expect(await testDb.auditLog.count({ where: { action: "entry.costs", subjectId: second.id } })).toBe(1);
    // the ledger line itself is untouched
    expect(await testDb.stockEntryLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ quantity: 1 });
  });

  it("only cost roles enter costs; a manager only in his own warehouses; never on voided or non-delivery entries", async () => {
    signInAs(staff);
    expect(await saveEntry(delivery({ lines: [{ productId: p1, quantity: "1", unitCost: "10" }] }))).toMatchObject({ ok: false });
    const e = saved(await saveEntry(delivery()));
    const line = await testDb.stockEntryLine.findFirstOrThrow({ where: { entryId: e.id } });
    expect(await setLineCosts({ entryId: e.id, costs: [{ lineId: line.id, unitCost: "10" }] })).toMatchObject({ ok: false, error: "errors.forbidden" });

    signInAs(await makeUser("MANAGER", [other]));
    expect(await setLineCosts({ entryId: e.id, costs: [{ lineId: line.id, unitCost: "10" }] })).toMatchObject({ ok: false, error: "stock.errors.warehouseNotAssigned" });

    signInAs(admin);
    const out = saved(await saveEntry(sale("10001", "1")));
    const outLine = await testDb.stockEntryLine.findFirstOrThrow({ where: { entryId: out.id } });
    expect(await setLineCosts({ entryId: out.id, costs: [{ lineId: outLine.id, unitCost: "10" }] })).toMatchObject({ ok: false, error: "entries.errors.notCostable" });
    // a line of another entry is refused
    expect(await setLineCosts({ entryId: e.id, costs: [{ lineId: outLine.id, unitCost: "10" }] })).toMatchObject({ ok: false });
  });

  it("a voided delivery is no longer cost pending", async () => {
    signInAs(admin);
    const e = saved(await saveEntry(delivery()));
    expect((await listEntries({ costPending: "1" })).rows.map((r) => r.id)).toEqual([e.id]);
    expect(await voidEntryAction({ entryId: e.id, reason: "wrong warehouse" })).toMatchObject({ ok: true });
    expect((await listEntries({ costPending: "1" })).rows).toEqual([]);
  });
});

describe("customer returns against the sale", () => {
  it("links the return to the sale, and refuses more than was sold or an unknown order", async () => {
    signInAs(admin);
    await saveEntry(delivery());
    const s = saved(await saveEntry(sale("#10 050", "3")));
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ reference: "10050" });

    const r1 = saved(await saveEntry(customerReturn("10050", "2")));
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: r1.id } })).toMatchObject({ originalEntryId: s.id, reasonCode: "CHANGED_MIND" });
    expect(await saveEntry(customerReturn("10050", "2"))).toMatchObject({ ok: false, error: "returns.errors.tooMany", params: { available: 1 } });
    // by entry number counts the earlier returns too
    expect(await saveEntry(customerReturn(s.number, "2"))).toMatchObject({ ok: false, error: "returns.errors.tooMany" });
    expect(await saveEntry(customerReturn(s.number, "1"))).toMatchObject({ ok: true });
    expect(await saveEntry(customerReturn("99999"))).toMatchObject({ ok: false, error: "returns.errors.noSale" });
    expect(await level(p1, main)).toBe(10);
  });

  it("an order shipped from two warehouses: returns typed differently still add up", async () => {
    signInAs(admin);
    await saveEntry(delivery());
    await saveEntry(delivery({ warehouseId: other, reference: "INV-J" }));
    await saveEntry(sale("12345", "1"));
    await saveEntry(sale("12345", "1", { warehouseId: other }));
    const r = saved(await saveEntry(customerReturn("# 12 345", "1")));
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ reference: "12345", originalEntryId: null });
    expect(await saveEntry(customerReturn("١٢٣٤٥", "1"))).toMatchObject({ ok: true });
    expect(await saveEntry(customerReturn("12345", "1"))).toMatchObject({ ok: false, error: "returns.errors.tooMany" });
  });

  it("a voided sale can't be returned", async () => {
    signInAs(admin);
    await saveEntry(delivery());
    const s = saved(await saveEntry(sale("10080", "1")));
    expect(await voidEntryAction({ entryId: s.id, reason: "cancelled" })).toMatchObject({ ok: true });
    expect(await saveEntry(customerReturn("10080", "1"))).toMatchObject({ ok: false, error: "returns.errors.noSale" });
  });

  it("frees the quantity again when a return is voided", async () => {
    signInAs(admin);
    await saveEntry(delivery());
    await saveEntry(sale("10060", "1"));
    const r = saved(await saveEntry(customerReturn("10060", "1")));
    expect(await saveEntry(customerReturn("10060", "1"))).toMatchObject({ ok: false });
    expect(await voidEntryAction({ entryId: r.id, reason: "typo" })).toMatchObject({ ok: true });
    expect(await saveEntry(customerReturn("10060", "1"))).toMatchObject({ ok: true });
  });

  it("requires the order no. and a reason code", async () => {
    signInAs(admin);
    expect(await saveEntry(customerReturn(""))).toMatchObject({ ok: false, fieldErrors: { reference: expect.any(String) } });
    expect(await saveEntry(customerReturn("10001", "1", { reasonCode: "" }))).toMatchObject({ ok: false, fieldErrors: { reasonCode: expect.any(String) } });
  });
});

describe("sales and other details", () => {
  it("warns about a website order number used before, and checks its format", async () => {
    signInAs(admin);
    await saveEntry(delivery());
    const s = saved(await saveEntry(sale("10070", "1")));
    expect(await findRepeatedOrder({ reason: "WEBSITE_ORDER", reference: "# 10070" })).toEqual({ ok: true, data: { id: s.id, number: s.number } });
    expect(await findRepeatedOrder({ reason: "WEBSITE_ORDER", reference: "10071" })).toEqual({ ok: true, data: null });
    expect(await saveEntry(sale("WC-1", "1"))).toMatchObject({ ok: false, fieldErrors: { reference: "entryForm.errors.websiteOrder" } });
  });

  it("direct sale: payment method required, salesperson defaults to the user", async () => {
    signInAs(staff);
    await saveEntry(delivery());
    const base = { ...emptyEntryForm("OUT"), reason: "DIRECT_SALE", warehouseId: main, customerName: "Khalid", customerPhone: "0501234567", lines: [{ productId: p1, quantity: "1" }] };
    expect(await saveEntry(base)).toMatchObject({ ok: false, fieldErrors: { paymentMethod: expect.any(String) } });
    const res = await saveEntry({ ...base, paymentMethod: "CARD" });
    expect(res).toMatchObject({ ok: true });
    const e = saved(res);
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: e.id } })).toMatchObject({ paymentMethod: "CARD", salesperson: staff.name });
  });

  it("damaged: broken needs a photo; up to 5 photos are stored, each only once and only the uploader's", async () => {
    signInAs(admin);
    await saveEntry(delivery());
    const base = { ...emptyEntryForm("OUT"), reason: "DAMAGED_LOST", warehouseId: main, note: "dropped", reasonCode: "BROKEN_WAREHOUSE", lines: [{ productId: p1, quantity: "1" }] };
    expect(await saveEntry(base)).toMatchObject({ ok: false, fieldErrors: { photoUrls: "entryForm.errors.photoRequired" } });
    const urls = [await photo(), await photo()];
    const e = saved(await saveEntry({ ...base, photoUrls: urls }));
    expect(await testDb.entryAttachment.count({ where: { entryId: e.id } })).toBe(2);
    expect(await saveEntry({ ...base, photoUrls: [urls[0]] })).toMatchObject({ ok: false }); // already used

    signInAs(manager);
    const theirs = await photo();
    signInAs(admin);
    expect(await saveEntry({ ...base, photoUrls: [theirs] })).toMatchObject({ ok: false }); // someone else's upload
    expect(await saveEntry({ ...base, photoUrls: await Promise.all([1, 2, 3, 4, 5, 6].map(photo)) })).toMatchObject({ ok: false });
  });

  it("a damaged entry that needs approval carries its photos and reason code to the approved entry", async () => {
    await testDb.setting.upsert({
      where: { key: "approvalRules" },
      create: { key: "approvalRules", value: { correction: { units: 0, value: null }, damaged: { units: 0, value: null }, void: { units: 0, value: null } } },
      update: { value: { correction: { units: 0, value: null }, damaged: { units: 0, value: null }, void: { units: 0, value: null } } },
    });
    signInAs(admin);
    await saveEntry(delivery());
    signInAs(staff);
    const url = await photo();
    const r = await saveEntry({ ...emptyEntryForm("OUT"), reason: "DAMAGED_LOST", warehouseId: main, note: "dropped", reasonCode: "BROKEN_DELIVERY", photoUrls: [url], lines: [{ productId: p1, quantity: "1" }] });
    expect(r).toMatchObject({ ok: true, data: { status: "pending" } });
    const req = await testDb.approvalRequest.findFirstOrThrow();
    expect(req.payload).toMatchObject({ reasonCode: "BROKEN_DELIVERY", photoUrls: [url] });
    // the photo is used on another entry meanwhile → approving the request is refused, nothing saved twice
    signInAs(admin);
    await testDb.entryAttachment.create({ data: { entryId: (await testDb.stockEntry.findFirstOrThrow()).id, attachmentId: url.split("/").pop()!, position: 0 } });
    const { decideRequestAction } = await import("@/server/actions/approvals");
    expect(await decideRequestAction({ requestId: req.id, approve: true })).toMatchObject({ ok: false, error: "photo.errors.used" });
    expect(await testDb.approvalRequest.findUniqueOrThrow({ where: { id: req.id } })).toMatchObject({ status: "PENDING" });
  });

  it("supplier return: expected credit stored as sent, then the credit is marked received and audited", async () => {
    signInAs(admin);
    await saveEntry(delivery());
    const base = { ...emptyEntryForm("OUT"), reason: "SUPPLIER_RETURN", warehouseId: main, supplierId: acme, reference: "RMA-7", lines: [{ productId: p1, quantity: "2" }] };
    expect(await saveEntry({ ...base, expectedCredit: "300" })).toMatchObject({ ok: false, fieldErrors: { reasonCode: expect.any(String) } });
    expect(await saveEntry({ ...base, expectedCredit: "300", reasonCode: "OTHER" })).toMatchObject({ ok: false, fieldErrors: { note: expect.any(String) } });
    const e = saved(await saveEntry({ ...base, expectedCredit: "300", reasonCode: "DEFECTIVE" }));
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: e.id } })).toMatchObject({ reasonCode: "DEFECTIVE", note: null });
    expect((await getEntryMoney(e.id))?.supplierReturn).toMatchObject({ status: "SENT", expectedCredit: "300.00", creditAmount: null });

    signInAs(staff);
    expect(await setSupplierReturnCredit({ entryId: e.id, status: "CREDIT_RECEIVED", creditAmount: "280" })).toMatchObject({ ok: false, error: "errors.forbidden" });
    signInAs(manager);
    expect(await setSupplierReturnCredit({ entryId: e.id, status: "CREDIT_RECEIVED", creditAmount: "280" })).toMatchObject({ ok: true });
    expect((await getEntryMoney(e.id))?.supplierReturn).toMatchObject({ status: "CREDIT_RECEIVED", creditAmount: "280.00", creditReceivedAt: expect.any(Date) });
    expect(await testDb.auditLog.count({ where: { action: "entry.supplierCredit", subjectId: e.id } })).toBe(1);

    signInAs(admin);
    expect(await voidEntryAction({ entryId: e.id, reason: "not sent" })).toMatchObject({ ok: true });
    expect(await setSupplierReturnCredit({ entryId: e.id, status: "SENT" })).toMatchObject({ ok: false, error: "entries.errors.voidedEntry" });
  });
});
