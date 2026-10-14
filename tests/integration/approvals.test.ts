/** Approval requests (docs/plans/v2.md Phase A): nothing reaches the ledger until approved. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { DEFAULT_APPROVAL_RULES, type ApprovalRules } from "@/lib/settings";
import { createEntry, type EntryInput } from "@/server/stock/createEntry";
import { voidEntry } from "@/server/stock/voidEntry";
import { cancelRequest, decideRequest, submitEntry, submitVoid } from "@/server/stock/approvals";
import { ApprovalRequiredError, InsufficientStockError } from "@/server/stock/errors";
import { saveApprovalRules } from "@/server/settings";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { expectLedgerMatchesLevels, level } from "../helpers/ledger";

type Actor = { id: string; role: Role; warehouseIds: string[] };
const actorOf = (u: Awaited<ReturnType<typeof makeUser>>): Actor => ({
  id: u.id,
  role: u.role,
  warehouseIds: u.warehouses.map((w) => w.id),
});

let main: string;
let jeddah: string;
let p1: string;
let admin: Actor;
let manager: Actor; // Riyadh Main
let manager2: Actor; // Riyadh Main
let jeddahManager: Actor;
let staff: Actor; // Riyadh Main

const correction = (direction: "IN" | "OUT", quantity: number, extra: Partial<EntryInput> = {}): EntryInput => ({
  direction,
  reason: "CORRECTION",
  warehouseId: main,
  lines: [{ productId: p1, quantity }],
  note: "counted",
  ...extra,
});
const delivery = (quantity: number, warehouseId = main): EntryInput => ({
  direction: "IN",
  reason: "SUPPLIER_DELIVERY",
  warehouseId,
  supplierName: "Acme",
  reference: "INV-1",
  lines: [{ productId: p1, quantity }],
});
const rules = (patch: Partial<ApprovalRules>) => saveApprovalRules(testDb, { ...DEFAULT_APPROVAL_RULES, ...patch }, admin.id);

beforeEach(async () => {
  await resetDatabase();
  main = (await makeWarehouse("SELLABLE", "Riyadh Main")).id;
  jeddah = (await makeWarehouse("SELLABLE", "Jeddah")).id;
  p1 = (await makeProduct("HMD-772")).id;
  admin = actorOf(await makeUser("ADMIN"));
  manager = actorOf(await makeUser("MANAGER", [main]));
  manager2 = actorOf(await makeUser("MANAGER", [main]));
  jeddahManager = actorOf(await makeUser("MANAGER", [jeddah]));
  staff = actorOf(await makeUser("STAFF", [main]));
  await createEntry(testDb, admin, delivery(10));
});
afterAll(() => testDb.$disconnect());

describe("submitEntry", () => {
  it("turns a staff correction into a pending request: no entry, no number, no stock change", async () => {
    const result = await submitEntry(testDb, staff, correction("OUT", 2));
    expect(result).toMatchObject({ status: "pending", request: { number: "REQ-000001" } });
    expect(await level(p1, main)).toBe(10);
    expect(await testDb.stockEntry.count({ where: { reason: "CORRECTION" } })).toBe(0);
    expect((await testDb.counter.findUniqueOrThrow({ where: { key: "COR" } })).value).toBe(0);
    const req = await testDb.approvalRequest.findFirstOrThrow();
    expect(req).toMatchObject({ kind: "ENTRY", rule: "correction", status: "PENDING", units: 2, warehouseId: main, requestedById: staff.id });
  });

  it("sends staff damaged/lost for approval too, but saves ordinary entries directly", async () => {
    const damaged = await submitEntry(testDb, staff, { direction: "OUT", reason: "DAMAGED_LOST", warehouseId: main, lines: [{ productId: p1, quantity: 1 }], note: "broken" });
    expect(damaged).toMatchObject({ status: "pending" });
    expect((await testDb.approvalRequest.findFirstOrThrow()).rule).toBe("damaged");
    const sale = await submitEntry(testDb, staff, { direction: "OUT", reason: "DIRECT_SALE", warehouseId: main, lines: [{ productId: p1, quantity: 1 }], customerName: "A", customerPhone: "0501234567" });
    expect(sale).toMatchObject({ status: "saved", entry: { number: "OUT-000001" } });
  });

  it("never asks an admin", async () => {
    expect(await submitEntry(testDb, admin, correction("OUT", 9))).toMatchObject({ status: "saved", entry: { number: "COR-000001" } });
    expect(await level(p1, main)).toBe(1);
  });

  it("saves directly up to the unit and SAR limits, asks above them", async () => {
    await testDb.product.update({ where: { id: p1 }, data: { cost: "100.00" } });
    await rules({ correction: { maxUnits: 3, maxValue: "250" } });
    expect(await submitEntry(testDb, manager, correction("IN", 2))).toMatchObject({ status: "saved" }); // 2 units, 200 SAR
    expect(await submitEntry(testDb, manager, correction("IN", 3))).toMatchObject({ status: "pending" }); // 300 SAR > 250
    expect(await submitEntry(testDb, manager, correction("IN", 4, {}))).toMatchObject({ status: "pending" }); // 4 units > 3
    const req = await testDb.approvalRequest.findFirstOrThrow({ orderBy: { number: "asc" } });
    expect(req.value?.toFixed(2)).toBe("300.00");
  });

  it("counts a product without a cost by units only", async () => {
    await rules({ correction: { maxUnits: 5, maxValue: "1" } });
    expect(await submitEntry(testDb, staff, correction("IN", 5))).toMatchObject({ status: "saved" });
    expect((await submitEntry(testDb, staff, correction("IN", 6))).status).toBe("pending");
  });

  it("returns the same request when the same form is submitted twice", async () => {
    const a = await submitEntry(testDb, staff, correction("OUT", 1, { idempotencyKey: "form-key-0001" }));
    const b = await submitEntry(testDb, staff, correction("OUT", 1, { idempotencyKey: "form-key-0001" }));
    expect(b).toEqual(a);
    expect(await testDb.approvalRequest.count()).toBe(1);
  });

  it("refuses the plain createEntry path above the limit (defence in depth)", async () => {
    await expect(createEntry(testDb, staff, correction("OUT", 1))).rejects.toBeInstanceOf(ApprovalRequiredError);
  });

  it("still checks the requester's warehouse before saving a request", async () => {
    await expect(submitEntry(testDb, staff, correction("IN", 1, { warehouseId: jeddah }))).rejects.toMatchObject({
      key: "stock.errors.warehouseNotAssigned",
    });
    expect(await testDb.approvalRequest.count()).toBe(0);
  });
});

describe("decideRequest", () => {
  async function pending(by: Actor = staff, input = correction("OUT", 3)) {
    const r = await submitEntry(testDb, by, input);
    if (r.status !== "pending") throw new Error("expected pending");
    return r.request.id;
  }

  it("lets a manager of the warehouse approve: the entry is saved for the requester and linked", async () => {
    const id = await pending();
    const result = await decideRequest(testDb, manager, { requestId: id, approve: true, note: "ok" });
    expect(result.status).toBe("APPROVED");
    expect(await level(p1, main)).toBe(7);
    const entry = await testDb.stockEntry.findUniqueOrThrow({ where: { id: result.entryId! }, include: { approvedVia: true } });
    expect(entry).toMatchObject({ number: "COR-000001", type: "CORRECTION_OUT", createdById: staff.id, note: "counted" });
    expect(entry.approvedVia).toMatchObject({ id, status: "APPROVED", decidedById: manager.id, decisionNote: "ok" });
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { action: "approval.approve" } });
    expect(audit).toMatchObject({ actorId: manager.id, subjectId: id });
    expect(audit.after).toEqual({ status: "APPROVED", entry: "COR-000001", note: "ok" });
    await expectLedgerMatchesLevels();
  });

  it("never lets anyone decide their own request", async () => {
    const id = await pending(manager);
    await expect(decideRequest(testDb, manager, { requestId: id, approve: true })).rejects.toMatchObject({ key: "approvals.errors.ownRequest" });
    await expect(decideRequest(testDb, manager2, { requestId: id, approve: true })).resolves.toMatchObject({ status: "APPROVED" });
  });

  it("keeps managers to their own warehouses and staff out entirely; admins decide anything", async () => {
    const id = await pending();
    await expect(decideRequest(testDb, jeddahManager, { requestId: id, approve: true })).rejects.toMatchObject({
      key: "approvals.errors.notYourWarehouse",
    });
    await expect(decideRequest(testDb, actorOf(await makeUser("STAFF", [main])), { requestId: id, approve: true })).rejects.toMatchObject({
      key: "errors.forbidden",
    });
    await expect(decideRequest(testDb, admin, { requestId: id, approve: true })).resolves.toMatchObject({ status: "APPROVED" });
  });

  it("keeps the request pending when stock is short at approval time", async () => {
    const id = await pending(staff, correction("OUT", 8));
    await createEntry(testDb, admin, { direction: "OUT", reason: "DIRECT_SALE", warehouseId: main, lines: [{ productId: p1, quantity: 5 }], customerName: "A", customerPhone: "0501234567" });
    await expect(decideRequest(testDb, manager, { requestId: id, approve: true })).rejects.toBeInstanceOf(InsufficientStockError);
    expect((await testDb.approvalRequest.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    expect(await testDb.stockEntry.count({ where: { reason: "CORRECTION" } })).toBe(0);
    expect(await level(p1, main)).toBe(5);
  });

  it("rejects only with a note, and a decided request can't be decided again", async () => {
    const id = await pending();
    await expect(decideRequest(testDb, manager, { requestId: id, approve: false, note: " " })).rejects.toMatchObject({
      key: "approvals.errors.noteRequired",
    });
    expect(await decideRequest(testDb, manager, { requestId: id, approve: false, note: "count again" })).toEqual({ status: "REJECTED", entryId: null });
    await expect(decideRequest(testDb, admin, { requestId: id, approve: true })).rejects.toMatchObject({ key: "approvals.errors.notPending" });
    expect(await level(p1, main)).toBe(10);
  });

  it("refuses to carry out a request from a deactivated user", async () => {
    const id = await pending();
    await testDb.user.update({ where: { id: staff.id }, data: { active: false } });
    await expect(decideRequest(testDb, manager, { requestId: id, approve: true })).rejects.toMatchObject({
      key: "approvals.errors.requesterInactive",
    });
    await expect(decideRequest(testDb, manager, { requestId: id, approve: false, note: "left the company" })).resolves.toMatchObject({
      status: "REJECTED",
    });
  });

  it("lets only the requester withdraw a pending request", async () => {
    const id = await pending();
    await expect(cancelRequest(testDb, manager, id)).rejects.toMatchObject({ key: "errors.forbidden" });
    await cancelRequest(testDb, staff, id);
    expect((await testDb.approvalRequest.findUniqueOrThrow({ where: { id } })).status).toBe("CANCELLED");
    await expect(cancelRequest(testDb, staff, id)).rejects.toMatchObject({ key: "approvals.errors.notPending" });
  });

  it("approves once when two approvers click at the same moment", async () => {
    const id = await pending();
    const results = await Promise.allSettled([
      decideRequest(testDb, manager, { requestId: id, approve: true }),
      decideRequest(testDb, admin, { requestId: id, approve: true }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await testDb.stockEntry.count({ where: { reason: "CORRECTION" } })).toBe(1);
    expect(await level(p1, main)).toBe(7);
  });
});

describe("voids", () => {
  it("lets a manager void in his warehouse only, through approval by default", async () => {
    const sale = await createEntry(testDb, admin, delivery(2));
    await expect(submitVoid(testDb, staff, { entryId: sale.id, reason: "wrong" })).rejects.toMatchObject({ key: "errors.forbidden" });
    const jeddahEntry = await createEntry(testDb, admin, delivery(1, jeddah));
    await expect(submitVoid(testDb, manager, { entryId: jeddahEntry.id, reason: "wrong" })).rejects.toMatchObject({
      key: "stock.errors.warehouseNotAssigned",
    });

    const result = await submitVoid(testDb, manager, { entryId: sale.id, reason: "wrong supplier" });
    expect(result).toMatchObject({ status: "pending", request: { number: "REQ-000001" } });
    expect(await level(p1, main)).toBe(12);
    await expect(submitVoid(testDb, manager2, { entryId: sale.id, reason: "again" })).rejects.toMatchObject({
      key: "approvals.errors.voidAlreadyRequested",
    });

    const id = result.status === "pending" ? result.request.id : "";
    await decideRequest(testDb, admin, { requestId: id, approve: true });
    expect(await level(p1, main)).toBe(10);
    const original = await testDb.stockEntry.findUniqueOrThrow({ where: { id: sale.id } });
    expect(original.voidedById).toBe(manager.id);
    await expectLedgerMatchesLevels();
  });

  it("voids directly within the manager's limit", async () => {
    await rules({ void: { maxUnits: 5, maxValue: null } });
    const e = await createEntry(testDb, admin, delivery(2));
    expect(await submitVoid(testDb, manager, { entryId: e.id, reason: "typo" })).toMatchObject({ status: "voided" });
  });

  it("needs both warehouses for a transfer, and one request covers both halves", async () => {
    const both = actorOf(await makeUser("MANAGER", [main, jeddah]));
    const trf = await createEntry(testDb, admin, { direction: "OUT", reason: "TRANSFER", warehouseId: main, destinationWarehouseId: jeddah, lines: [{ productId: p1, quantity: 4 }] });
    await expect(submitVoid(testDb, manager, { entryId: trf.id, reason: "wrong" })).rejects.toMatchObject({ key: "stock.errors.warehouseNotAssigned" });
    const r = await submitVoid(testDb, both, { entryId: trf.linked!.id, reason: "wrong" }); // clicked on the IN half
    expect(r.status).toBe("pending");
    const req = await testDb.approvalRequest.findFirstOrThrow();
    expect(req).toMatchObject({ targetEntryId: trf.id, warehouseId: main, otherWarehouseId: jeddah, units: 4 });
    // A manager of only one of the two warehouses can't decide it.
    await expect(decideRequest(testDb, manager, { requestId: req.id, approve: true })).rejects.toMatchObject({
      key: "approvals.errors.notYourWarehouse",
    });
  });

  it("closes a pending void request when an admin voids the entry directly", async () => {
    const e = await createEntry(testDb, admin, delivery(2));
    const r = await submitVoid(testDb, manager, { entryId: e.id, reason: "wrong" });
    await voidEntry(testDb, admin, { entryId: e.id, reason: "admin fixed it" });
    const req = await testDb.approvalRequest.findUniqueOrThrow({ where: { id: r.status === "pending" ? r.request.id : "" } });
    expect(req).toMatchObject({ status: "CANCELLED", decidedById: admin.id });
  });
});
