import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { ReportTabs } from "@/components/reports/report-tabs";

export default async function ReportsLayout({ children }: LayoutProps<"/reports">) {
  const t = await getTranslations("reports");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
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
