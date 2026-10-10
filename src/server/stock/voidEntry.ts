/**
 * Void (cancel) a saved entry — ADMIN only. Saved entries are never edited or deleted: voiding creates
 * a reverse entry (type VOID, linked to the original) that undoes the stock change, and stamps the
 * original with voidedAt / voidedById. All in ONE transaction:
 *   1. lock the original (and its transfer partner) FOR UPDATE, re-check they aren't voided
 *   2. one VOID entry per original (VOID-000001, …), reason text in its `note` (decision Q12c)
 *   3. reverse the stock through applyLevelChanges — refused if it would go negative (Q12b)
 * Voiding either half of a transfer voids both halves (two VOID numbers, Q12a).
 */
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { EntryType } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import { directionOf } from "@/lib/stock/lines";
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
import { EntryRuleError } from "./errors";

export type VoidInput = { entryId: string; reason: string };
export type VoidResult = { voids: { id: string; number: string; voidedEntryId: string }[] };

export const MIN_VOID_REASON = 3;
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

export async function voidEntry(client: PrismaClient, actor: EntryActor, input: VoidInput): Promise<VoidResult> {
  return withRetry(() => client.$transaction((tx) => voidEntryInTx(tx, actor, input), TX_OPTIONS));
}

export async function voidEntryInTx(tx: Tx, actor: EntryActor, input: VoidInput): Promise<VoidResult> {
  if (!can(actor.role, "entry:void")) throw new EntryRuleError("errors.forbidden");
  const reason = input.reason.trim();
  if (reason.length < MIN_VOID_REASON) throw new EntryRuleError("void.errors.reasonRequired");

  const first = await tx.stockEntry.findUnique({
    where: { id: input.entryId },
    select: { id: true, type: true, linkedEntryId: true },
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

  // Lock in id order so two admins voiding the two halves at once can't deadlock; the loser then sees
  // voidedAt set below and gets "already voided".
  const sorted = [...ids].sort();
  await tx.$queryRaw`SELECT id FROM \`StockEntry\` WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`;
  const originals = await tx.stockEntry.findMany({
    where: { id: { in: sorted } },
    select: { id: true, type: true, warehouseId: true, voidedAt: true, lines: { select: { productId: true, quantity: true } } },
    orderBy: { id: "asc" },
  });
  if (originals.some((e) => e.voidedAt)) throw new EntryRuleError("void.errors.alreadyVoided");

  const changes: LevelChange[] = [];
  const voids: VoidResult["voids"] = [];
  const now = new Date();

  for (const original of originals) {
    // A void that puts stock back needs an active warehouse (an inactive one must stay empty).
    if (directionOf(original.type as Exclude<EntryType, "VOID">) === -1) {
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
  return { voids };
}
