/**
 * Approval requests (docs/plans/v2.md, decision V1). Nothing reaches the ledger until a request is
 * approved — then the entry / void is created through the normal services, with the requester as its
 * creator. Requests are never deleted: PENDING → APPROVED | REJECTED | CANCELLED.
 *
 *   submitEntry / submitVoid   save directly, or (ApprovalRequiredError) save a request instead
 *   decideRequest              approve (runs the entry/void) or reject — never by the requester
 *   cancelRequest              the requester withdraws a pending request
 */
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { can, canWriteToWarehouse } from "@/lib/permissions";
import { formatEntryNumber, REQUEST_NUMBER_PREFIX } from "@/lib/stock/numbering";
import type { EntryActor } from "@/lib/stock/policy";
import { audit } from "@/server/audit";
import { createEntryInTx, nextCounterValue, withRetry, type EntryInput, type SavedEntry, type Tx } from "./createEntry";
import { voidEntryInTx, type VoidInput, type VoidResult } from "./voidEntry";
import { ApprovalRequiredError, EntryRuleError } from "./errors";

const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

/** Note stored when a pending void request is closed because the entry was voided another way. */
export const AUTO_CANCELLED_NOTE = "voided";

export type PendingRequest = { id: string; number: string };
export type EntrySubmitResult = { status: "saved"; entry: SavedEntry } | { status: "pending"; request: PendingRequest };
export type VoidSubmitResult = { status: "voided"; result: VoidResult } | { status: "pending"; request: PendingRequest };

/** The entry input as stored on a request (re-validated when it is approved). */
const storedEntrySchema = z.object({
  direction: z.enum(["IN", "OUT"]),
  reason: z.enum(["CORRECTION", "DAMAGED_LOST"]),
  warehouseId: z.string(),
  destinationWarehouseId: z.string().nullish(),
  // "DAMAGED" was the old name of BROKEN (plan channels-returns); requests saved before keep working.
  returnCondition: z
    .enum(["RESELLABLE", "BROKEN", "TRASHED", "DAMAGED"])
    .nullish()
    .transform((v) => (v === "DAMAGED" ? "BROKEN" : v)),
  lines: z.array(z.object({ productId: z.string(), quantity: z.number().int() })).min(1),
  reference: z.string().nullish(),
  customerName: z.string().nullish(),
  customerPhone: z.string().nullish(),
  technicianName: z.string().nullish(),
  supplierName: z.string().nullish(),
  note: z.string().nullish(),
  photoUrl: z.string().nullish(),
  photoUrls: z.array(z.string()).max(5).optional(),
  reasonCode: z.string().nullish(),
});
const storedVoidSchema = z.object({ entryId: z.string(), reason: z.string() });

// ─── Submitting ─────────────────────────────────────────────────────────────

export async function submitEntry(client: PrismaClient, actor: EntryActor, input: EntryInput): Promise<EntrySubmitResult> {
  const key = input.idempotencyKey || null;
  const repeat = key ? await earlierSubmit(client, key, actor) : null;
  if (repeat?.status === "pending" || repeat?.status === "saved") return repeat;
  try {
    return await withRetry(() =>
      client.$transaction(async (tx): Promise<EntrySubmitResult> => {
        try {
          return { status: "saved", entry: await createEntryInTx(tx, actor, input) };
        } catch (e) {
          if (!(e instanceof ApprovalRequiredError)) throw e;
          const payload = { ...input, idempotencyKey: undefined }; // undefined is dropped from the JSON
          const request = await createRequest(tx, actor, "ENTRY", e, payload, key);
          return { status: "pending", request };
        }
      }, TX_OPTIONS),
    );
  } catch (e) {
    if (key && isUniqueViolation(e)) {
      const again = await earlierSubmit(client, key, actor);
      if (again?.status === "pending" || again?.status === "saved") return again;
    }
    throw e;
  }
}

export async function submitVoid(
  client: PrismaClient,
  actor: EntryActor,
  input: VoidInput & { idempotencyKey?: string | null },
): Promise<VoidSubmitResult> {
  const key = input.idempotencyKey || null;
  if (key) {
    const existing = await requestForKey(client, key, actor);
    if (existing) return { status: "pending", request: existing };
  }
  try {
    return await withRetry(() =>
      client.$transaction(async (tx): Promise<VoidSubmitResult> => {
        try {
          return { status: "voided", result: await voidEntryInTx(tx, actor, { entryId: input.entryId, reason: input.reason }) };
        } catch (e) {
          if (!(e instanceof ApprovalRequiredError)) throw e;
          const payload = { entryId: e.need.targetEntryId ?? input.entryId, reason: input.reason.trim().slice(0, 500) };
          const request = await createRequest(tx, actor, "VOID", e, payload, key);
          return { status: "pending", request };
        }
      }, TX_OPTIONS),
    );
  } catch (e) {
    if (isUniqueViolation(e)) {
      if (key) {
        const existing = await requestForKey(client, key, actor);
        if (existing) return { status: "pending", request: existing };
      }
      // Another pending void request for this entry already exists (unique pendingVoidOf).
      throw new EntryRuleError("approvals.errors.voidAlreadyRequested");
    }
    throw e;
  }
}

async function createRequest(
  tx: Tx,
  actor: EntryActor,
  kind: "ENTRY" | "VOID",
  e: ApprovalRequiredError,
  payload: object,
  idempotencyKey: string | null,
): Promise<PendingRequest> {
  const number = formatEntryNumber(REQUEST_NUMBER_PREFIX, await nextCounterValue(tx, REQUEST_NUMBER_PREFIX));
  return tx.approvalRequest.create({
    data: {
      number,
      kind,
      rule: e.need.rule,
      warehouseId: e.need.warehouseId,
      otherWarehouseId: e.need.otherWarehouseId ?? null,
      targetEntryId: e.need.targetEntryId ?? null,
      payload: JSON.parse(JSON.stringify(payload)),
      units: e.need.units,
      value: e.need.value,
      idempotencyKey,
      requestedById: actor.id,
    },
    select: { id: true, number: true },
  });
}

/** A form submitted again with the same key: the entry or the request saved the first time. */
async function earlierSubmit(client: PrismaClient, key: string, actor: EntryActor): Promise<EntrySubmitResult | null> {
  const request = await requestForKey(client, key, actor);
  if (request) return { status: "pending", request };
  const entry = await client.stockEntry.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, number: true, createdById: true, linkedFrom: { where: { type: "TRANSFER_IN" }, select: { id: true, number: true } } },
  });
  if (!entry) return null;
  if (entry.createdById !== actor.id) throw new EntryRuleError("stock.errors.duplicateSubmit");
  const linked = entry.linkedFrom[0];
  return { status: "saved", entry: linked ? { id: entry.id, number: entry.number, linked } : { id: entry.id, number: entry.number } };
}

async function requestForKey(client: PrismaClient, key: string, actor: EntryActor): Promise<PendingRequest | null> {
  const request = await client.approvalRequest.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, number: true, requestedById: true },
  });
  if (!request) return null;
  if (request.requestedById !== actor.id) throw new EntryRuleError("stock.errors.duplicateSubmit");
  return { id: request.id, number: request.number };
}

// ─── Deciding ───────────────────────────────────────────────────────────────

export type DecideInput = { requestId: string; approve: boolean; note?: string | null };
export type DecideResult = { status: "APPROVED" | "REJECTED"; entryId: string | null };

export const MIN_REJECT_NOTE = 3;

/** Why this user may NOT decide this request (a translation key), or null. Pure. */
export function decideError(
  approver: EntryActor,
  request: { requestedById: string; warehouseId: string; otherWarehouseId: string | null },
): string | null {
  if (!can(approver.role, "approval:decide")) return "errors.forbidden";
  if (request.requestedById === approver.id) return "approvals.errors.ownRequest";
  const warehouses = [request.warehouseId, request.otherWarehouseId].filter((w): w is string => Boolean(w));
  if (warehouses.some((w) => !canWriteToWarehouse(approver, w))) return "approvals.errors.notYourWarehouse";
  return null;
}

export async function decideRequest(client: PrismaClient, approver: EntryActor, input: DecideInput): Promise<DecideResult> {
  return withRetry(() =>
    client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM \`ApprovalRequest\` WHERE id = ${input.requestId} FOR UPDATE`;
      const request = await tx.approvalRequest.findUnique({
        where: { id: input.requestId },
        include: { requestedBy: { select: { id: true, role: true, active: true, warehouses: { select: { id: true } } } } },
      });
      if (!request) throw new EntryRuleError("errors.notFound");
      if (request.status !== "PENDING") throw new EntryRuleError("approvals.errors.notPending");
      const denied = decideError(approver, request);
      if (denied) throw new EntryRuleError(denied);

      const note = input.note?.trim().slice(0, 500) || null;
      const decided = { decidedById: approver.id, decidedAt: new Date(), decisionNote: note };

      if (!input.approve) {
        if (!note || note.length < MIN_REJECT_NOTE) throw new EntryRuleError("approvals.errors.noteRequired");
        await tx.approvalRequest.update({ where: { id: request.id }, data: { status: "REJECTED", ...decided } });
        await audit(tx, approver.id, {
          action: "approval.reject",
          subjectType: "approval",
          subjectId: request.id,
          subjectLabel: request.number,
          after: { status: "REJECTED", note },
        });
        return { status: "REJECTED" as const, entryId: null };
      }

      // Carried out with the requester as the creator; his rights are checked as they are now.
      if (!request.requestedBy.active) throw new EntryRuleError("approvals.errors.requesterInactive");
      const requester: EntryActor = {
        id: request.requestedBy.id,
        role: request.requestedBy.role,
        warehouseIds: request.requestedBy.warehouses.map((w) => w.id),
      };
      let entry: { id: string; number: string };
      if (request.kind === "ENTRY") {
        const payload = storedEntrySchema.parse(request.payload);
        entry = await createEntryInTx(tx, requester, payload, { approvedBy: approver });
      } else {
        const payload = storedVoidSchema.parse(request.payload);
        const result = await voidEntryInTx(tx, requester, payload, { approvedBy: approver, requestId: request.id });
        entry = result.voids[0];
      }
      const entryId = entry.id;
      await tx.approvalRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", resultEntryId: entryId, ...decided },
      });
      await audit(tx, approver.id, {
        action: "approval.approve",
        subjectType: "approval",
        subjectId: request.id,
        subjectLabel: request.number,
        after: { status: "APPROVED", entry: entry.number, ...(note ? { note } : {}) },
      });
      return { status: "APPROVED" as const, entryId };
    }, TX_OPTIONS),
  );
}

export async function cancelRequest(client: PrismaClient, actor: EntryActor, requestId: string): Promise<void> {
  await client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM \`ApprovalRequest\` WHERE id = ${requestId} FOR UPDATE`;
    const request = await tx.approvalRequest.findUnique({ where: { id: requestId }, select: { status: true, requestedById: true } });
    if (!request) throw new EntryRuleError("errors.notFound");
    if (request.requestedById !== actor.id) throw new EntryRuleError("errors.forbidden");
    if (request.status !== "PENDING") throw new EntryRuleError("approvals.errors.notPending");
    await tx.approvalRequest.update({
      where: { id: requestId },
      data: { status: "CANCELLED", decidedById: actor.id, decidedAt: new Date() },
    });
  }, TX_OPTIONS);
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === "P2002";
}
