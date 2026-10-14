/** Read / write app settings (the `Setting` table). Values are validated with src/lib/settings.ts. */
import type { PrismaClient } from "@/generated/prisma/client";
import { parseApprovalRules, type ApprovalRules } from "@/lib/settings";
import type { Tx } from "@/server/stock/createEntry";

type Client = PrismaClient | Tx;

export const SETTING_KEYS = { approvalRules: "approvalRules" } as const;

export async function getApprovalRules(client: Client): Promise<ApprovalRules> {
  const row = await client.setting.findUnique({ where: { key: SETTING_KEYS.approvalRules } });
  return parseApprovalRules(row?.value);
}

export async function saveApprovalRules(client: Client, rules: ApprovalRules, actorId: string) {
  await client.setting.upsert({
    where: { key: SETTING_KEYS.approvalRules },
    create: { key: SETTING_KEYS.approvalRules, value: rules, updatedById: actorId },
    update: { value: rules, updatedById: actorId },
  });
}
