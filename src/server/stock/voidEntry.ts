/**
 * Void (cancel) a saved entry — ADMIN, or a MANAGER for entries in his warehouses (above the approval
 * limit a manager's void becomes a request, see src/server/stock/approvals.ts). Saved entries are never edited or deleted: voiding creates
 * a reverse entry (type VOID, linked to the original) that undoes the stock change, and stamps the
 * original with voidedAt / voidedById. All in ONE transaction:
 *   1. lock the original (and its transfer partner) FOR UPDATE, re-check they aren't voided
 *   2. one VOID entry per original (VOID-000001, …), reason text in its `note` (decision Q12c)
 *   3. reverse the stock through applyLevelChanges — refused if it would go negative (Q12b)
 * Voiding either half of a transfer voids both halves (two VOID numbers, Q12a). Likewise a trashed customer
 * return and its automatic write-off are voided together (plan channels-returns).
 */
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { EntryType } from "@/generated/prisma/enums";
import { can, canWriteToWarehouse } from "@/lib/permissions";
import { directionOf } from "@/lib/stock/lines";
import { RETURNED_TRASHED } from "@/lib/stock/details";
import { formatEntryNumber } from "@/lib/stock/numbering";
import type { EntryActor } from "@/lib/stock/policy";
import {
  applyLevelChanges,
  lockActiveWarehouse,
  nextCounterValue,
  withRetry,
  type LevelChange,
  type Tx,
} from "./createEntry";
import { ApprovalRequiredError, EntryRuleError } from "./errors";
import { approvalNeeded } from "./approval-rules";

export type VoidInput = { entryId: string; reason: string };
/** approvedBy: an approved request is being carried out. requestId: that request (not cancelled below). */
export type VoidOptions = { approvedBy?: { id: string }; requestId?: string };
export type VoidResult = { voids: { id: string; number: string; voidedEntryId: string }[] };

export const MIN_VOID_REASON = 3;
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

export async function voidEntry(client: PrismaClient, actor: EntryActor, input: VoidInput): Promise<VoidResult> {
  return withRetry(() => client.$transaction((tx) => voidEntryInTx(tx, actor, input), TX_OPTIONS));
}

export async function voidEntryInTx(
  tx: Tx,
  actor: EntryActor,
  input: VoidInput,
  options: VoidOptions = {},
): Promise<VoidResult> {
  if (!can(actor.role, "entry:void")) throw new EntryRuleError("errors.forbidden");
  const reason = input.reason.trim();
  if (reason.length < MIN_VOID_REASON) throw new EntryRuleError("void.errors.reasonRequired");

  const first = await tx.stockEntry.findUnique({
    where: { id: input.entryId },
    select: { id: true, type: true, reason: true, reasonCode: true, itemCondition: true, linkedEntryId: true, originalEntryId: true },
  });
  if (!first) throw new EntryRuleError("errors.notFound");
  if (first.type === "VOID") throw new EntryRuleError("void.errors.cannotVoidVoid");

  // A transfer is voided as a pair.
  const ids = [first.id];
  if (first.type === "TRANSFER_IN" && first.linkedEntryId) ids.push(first.linkedEntryId);
  if (first.type === "TRANSFER_OUT") {
    const inHalf = await tx.stockEntry.findFirst({
      where: { linkedEntryId: first.id, type: "TRANSFER_IN" },
      select: { id: true },
    });
    if (inHalf) ids.push(inHalf.id);
  }
  // A trashed return is voided with its write-off, and the other way round.
  if (first.reason === "DAMAGED_LOST" && first.reasonCode === RETURNED_TRASHED && first.originalEntryId) ids.push(first.originalEntryId);
  if (first.reason === "CUSTOMER_RETURN" && first.itemCondition === "TRASHED") {
    const writeOff = await tx.stockEntry.findFirst({
      where: { originalEntryId: first.id, reason: "DAMAGED_LOST", reasonCode: RETURNED_TRASHED },
      select: { id: true },
    });
    if (writeOff) ids.push(writeOff.id);
  }

  // Lock in id order so two admins voiding the two halves at once can't deadlock; the loser then sees
  // voidedAt set below and gets "already voided".
  const sorted = [...ids].sort();
  await tx.$queryRaw`SELECT id FROM \`StockEntry\` WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`;
  const originals = await tx.stockEntry.findMany({
    where: { id: { in: sorted } },
    select: { id: true, type: true, reason: true, warehouseId: true, voidedAt: true, lines: { select: { productId: true, quantity: true } } },
    orderBy: { id: "asc" },
  });
  if (originals.some((e) => e.voidedAt)) throw new EntryRuleError("void.errors.alreadyVoided");
  // A manager voids only in his own warehouses (both warehouses of a transfer).
  if (originals.some((e) => !canWriteToWarehouse(actor, e.warehouseId))) {
    throw new EntryRuleError("stock.errors.warehouseNotAssigned");
  }

  if (!options.approvedBy) {
    // Units of the movement once (a transfer's two halves, or a trashed return and its write-off, carry the same lines).
    const primary = originals.find((e) => e.type === "TRANSFER_OUT" || e.reason === "CUSTOMER_RETURN") ?? originals[0];
    const need = await approvalNeeded(tx, actor, "void", primary.lines);
    if (need) {
      const other = originals.find((e) => e.id !== primary.id);
      throw new ApprovalRequiredError({
        ...need,
        warehouseId: primary.warehouseId,
        otherWarehouseId: other && other.warehouseId !== primary.warehouseId ? other.warehouseId : null,
        targetEntryId: primary.id,
      });
    }
  }

  // Share-lock the products (like entry saves, so retiring a product waits for this void), and never put
  // stock back onto an INACTIVE product — it must stay empty (decision PB1). Voids that remove stock are fine.
  const productIds = [...new Set(originals.flatMap((e) => e.lines.map((l) => l.productId)))].sort();
  await tx.$queryRaw`SELECT id FROM \`Product\` WHERE id IN (${Prisma.join(productIds)}) LOCK IN SHARE MODE`;
  // Net per product + warehouse: a trashed return voided with its write-off puts nothing back.
  const netBack = new Map<string, { productId: string; qty: number }>();
  for (const e of originals) {
    for (const l of e.lines) {
      const key = `${l.productId}|${e.warehouseId}`;
      const prev = netBack.get(key)?.qty ?? 0;
      netBack.set(key, { productId: l.productId, qty: prev - directionOf(e.type as Exclude<EntryType, "VOID">) * l.quantity });
    }
  }
  const restocked = new Set([...netBack.values()].filter((v) => v.qty > 0).map((v) => v.productId));
  const restockedWarehouses = new Set([...netBack.entries()].filter(([, v]) => v.qty > 0).map(([k]) => k.split("|")[1]));
  if (restocked.size) {
    const retired = await tx.product.findFirst({ where: { id: { in: [...restocked] }, status: "INACTIVE" }, select: { modelCode: true } });
    if (retired) throw new EntryRuleError("void.errors.productRetired", { modelCode: retired.modelCode });
  }

  const changes: LevelChange[] = [];
  const voids: VoidResult["voids"] = [];
  const now = new Date();

  for (const original of originals) {
    // A void that puts stock back needs an active warehouse (an inactive one must stay empty).
    if (restockedWarehouses.has(original.warehouseId)) {
      await lockActiveWarehouse(tx, original.warehouseId).catch(() => {
        throw new EntryRuleError("void.errors.warehouseInactive");
      });
    }
    const number = formatEntryNumber("VOID", await nextCounterValue(tx, "VOID"));
    const created = await tx.stockEntry.create({
      data: {
        number,
        type: "VOID",
        reason: "VOID",
        warehouseId: original.warehouseId,
        linkedEntryId: original.id,
        note: reason.slice(0, 500),
        createdById: actor.id,
        lines: { create: original.lines },
      },
      select: { id: true, number: true },
    });
    voids.push({ ...created, voidedEntryId: original.id });

    const sign = directionOf("VOID", original.type);
    for (const line of original.lines) {
      changes.push({ productId: line.productId, warehouseId: original.warehouseId, delta: sign * line.quantity });
    }

    // The only update ever made to a saved entry (CLAUDE.md "Entries are immutable").
    await tx.stockEntry.update({ where: { id: original.id }, data: { voidedAt: now, voidedById: actor.id } });
  }

  await applyLevelChanges(tx, changes);

  // Other void requests for these entries have nothing left to do.
  await tx.approvalRequest.updateMany({
    where: {
      kind: "VOID",
      status: "PENDING",
      targetEntryId: { in: sorted },
      ...(options.requestId ? { id: { not: options.requestId } } : {}),
    },
    data: { status: "CANCELLED", decidedAt: now, decidedById: actor.id, decisionNote: "voided" },
  });
  return { voids };
}
