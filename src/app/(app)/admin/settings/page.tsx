import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { approvalRulesToForm } from "@/lib/settings";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/server/auth/dal";
import { getApprovalRules } from "@/server/settings";
import { ApprovalRulesForm } from "./approval-rules-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("settings"))("title") };
}

/** App settings (ADMIN). Phase A: approval limits. More settings arrive in Phase G. */
export default async function SettingsPage() {
  await requirePagePermission("settings:manage");
  const [t, rules] = await Promise.all([getTranslations("settings"), getApprovalRules(db)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ApprovalRulesForm initial={approvalRulesToForm(rules)} />
    </div>
  );
}
