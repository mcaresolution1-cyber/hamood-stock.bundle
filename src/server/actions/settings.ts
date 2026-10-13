"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { approvalRulesFormSchema, type ApprovalRules } from "@/lib/settings";
import { requirePermission } from "@/server/auth/dal";
import { audit, changedFields } from "@/server/audit";
import { getApprovalRules, saveApprovalRules } from "@/server/settings";
import { guarded, type ActionResult } from "./result";

export async function saveApprovalRulesAction(values: unknown): Promise<ActionResult> {
  return guarded(async () => {
    const user = await requirePermission("settings:manage");
    const form = approvalRulesFormSchema.parse(values);
    const rules: ApprovalRules = form;
    await db.$transaction(async (tx) => {
      const before = await getApprovalRules(tx);
      await saveApprovalRules(tx, rules, user.id);
      const diff = changedFields(before, rules);
      if (diff) await audit(tx, user.id, { action: "setting.update", subjectType: "setting", subjectId: "approvalRules", ...diff });
    });
    revalidatePath("/admin/settings");
    return null;
  });
}
