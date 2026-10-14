/**
 * Which entries need approval, and whether this one does (docs/plans/v2.md, Phase A).
 * Corrections, damaged/lost and voids by anyone but an ADMIN are compared with the limits in Settings.
 */
import { Prisma } from "@/generated/prisma/client";
import type { EntryReason, EntryType } from "@/generated/prisma/enums";
import { exceedsRule, type ApprovalRuleKey } from "@/lib/settings";
import type { EntryActor } from "@/lib/stock/policy";
import { getApprovalRules } from "@/server/settings";
import type { Tx } from "./createEntry";

export function approvalRuleFor(type: EntryType, reason: EntryReason): ApprovalRuleKey | null {
  if (type === "CORRECTION_IN" || type === "CORRECTION_OUT") return "correction";
  if (reason === "DAMAGED_LOST") return "damaged";
  if (type === "VOID") return "void";
  return null;
}

/** Units and value (Σ quantity × current product cost) of some lines. Value null when no product has a cost. */
export async function linesUnitsAndValue(tx: Tx, lines: readonly { productId: string; quantity: number }[]) {
  const products = await tx.product.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.productId))] } },
    select: { id: true, cost: true },
  });
  const cost = new Map(products.map((p) => [p.id, p.cost]));
  let units = 0;
  let value = new Prisma.Decimal(0);
  let anyCost = false;
  for (const l of lines) {
    units += l.quantity;
    const c = cost.get(l.productId);
    if (c != null) {
      anyCost = true;
      value = value.add(c.mul(l.quantity));
    }
  }
  return { units, value: anyCost ? value.toFixed(2) : null };
}

/** null = may save directly; otherwise the rule, units and value to put on the request. */
export async function approvalNeeded(
  tx: Tx,
  actor: EntryActor,
  rule: ApprovalRuleKey,
  lines: readonly { productId: string; quantity: number }[],
): Promise<{ rule: ApprovalRuleKey; units: number; value: string | null } | null> {
  if (actor.role === "ADMIN") return null;
  const rules = await getApprovalRules(tx);
  const { units, value } = await linesUnitsAndValue(tx, lines);
  return exceedsRule(rules[rule], units, value) ? { rule, units, value } : null;
}
