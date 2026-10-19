import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { ReportTabs } from "@/components/reports/report-tabs";
import { GenerateReportDialog } from "@/components/reports/generate-report-dialog";
import { reportChoices } from "@/server/queries/inventory";
import { requirePagePermission } from "@/server/auth/dal";

export default async function ReportsLayout({ children }: LayoutProps<"/reports">) {
  // Checked here too: the layout's dialog lists warehouses and categories (the pages check again).
  await requirePagePermission("stock:view");
  const [t, choices] = await Promise.all([getTranslations("reports"), reportChoices()]);
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} actions={<GenerateReportDialog {...choices} />} />
      <ReportTabs
        label={t("title")}
        tabs={(["stockOnHand", "movements", "lowStock", "outByReason"] as const).map((k) => ({
          href: `/reports/${{ stockOnHand: "stock-on-hand", movements: "movements", lowStock: "low-stock", outByReason: "out-by-reason" }[k]}`,
          label: t(`tabs.${k}`),
        }))}
      />
      <div className="mt-4">{children}</div>
    </>
  );
}
