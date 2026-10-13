/**
 * App settings stored in the `Setting` table (one JSON value per key) — schemas, defaults and the pure
 * approval-threshold rule. Server reads/writes are in src/server/settings.ts.
 */
import { z } from "zod";
import { moneyText, wholeNumberText } from "@/lib/validation/common";

export const APPROVAL_RULES = ["correction", "damaged", "void"] as const;
export type ApprovalRuleKey = (typeof APPROVAL_RULES)[number];

/**
 * "Save directly up to `maxUnits` units and `maxValue` SAR" — anything above needs approval.
 * maxUnits 0 = every one needs approval. maxValue null = no value limit.
 */
export type ApprovalRule = { maxUnits: number; maxValue: string | null };
export type ApprovalRules = Record<ApprovalRuleKey, ApprovalRule>;

/** Decision A3: until an admin changes them, every non-admin request needs approval. */
export const DEFAULT_APPROVAL_RULES: ApprovalRules = {
  correction: { maxUnits: 0, maxValue: null },
  damaged: { maxUnits: 0, maxValue: null },
  void: { maxUnits: 0, maxValue: null },
};

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

const storedRule = z.object({
  maxUnits: z.number().int().min(0).max(100_000),
  maxValue: z.string().regex(MONEY).nullable(),
});
const storedRules = z.object({ correction: storedRule, damaged: storedRule, void: storedRule });

/** A stored value that doesn't parse (hand-edited, older shape) falls back to the defaults. */
export function parseApprovalRules(value: unknown): ApprovalRules {
  const parsed = storedRules.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_APPROVAL_RULES;
}

/** Settings form: text inputs (Arabic digits accepted), empty SAR = no value limit. */
const ruleForm = z.object({
  maxUnits: wholeNumberText.pipe(z.number().max(100_000, "validation.tooLarge")),
  maxValue: moneyText,
});
export const approvalRulesFormSchema = z.object({ correction: ruleForm, damaged: ruleForm, void: ruleForm });
export type ApprovalRulesFormValues = z.input<typeof approvalRulesFormSchema>;

export function approvalRulesToForm(rules: ApprovalRules): ApprovalRulesFormValues {
  const one = (r: ApprovalRule) => ({ maxUnits: String(r.maxUnits), maxValue: r.maxValue ?? "" });
  return { correction: one(rules.correction), damaged: one(rules.damaged), void: one(rules.void) };
}

/** "123.4" → 12340. Money is compared as whole halalas (exact: ≤ 12 digits), never as float SAR. */
export function toHalalas(amount: string): number {
  const [whole, frac = ""] = amount.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/**
 * Does this request need approval? `value` is Σ quantity × cost in SAR (null when no line has a cost —
 * then only the unit limit applies).
 */
export function exceedsRule(rule: ApprovalRule, units: number, value: string | null): boolean {
  if (units > rule.maxUnits) return true;
  if (rule.maxValue !== null && value !== null && toHalalas(value) > toHalalas(rule.maxValue)) return true;
  return false;
}
