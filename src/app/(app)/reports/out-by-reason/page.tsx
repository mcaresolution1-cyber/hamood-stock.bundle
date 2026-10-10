import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { ReportTable, type ReportColumn } from "@/components/reports/report-table";
import { ReportBar, qs } from "@/components/reports/report-bar";
import { requirePagePermission } from "@/server/auth/dal";
import { outByReason } from "@/server/queries/reports";
import { activeWarehouseOptions } from "@/server/queries/warehouses";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("reports.tabs"))("outByReason") };
}

export default async function OutByReasonPage({ searchParams }: PageProps<"/reports/out-by-reason">) {
  await requirePagePermission("stock:view");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [t, warehouses, r] = await Promise.all([
    getTranslations(),
    activeWarehouseOptions(),
    outByReason({ from: one("from"), to: one("to"), warehouseId: one("warehouseId") || undefined }),
  ]);
  const warehouseId = r.warehouseId;

  const columns: ReportColumn[] = [
    { key: "month", header: t("reports.col.month"), kind: "code" },
    ...r.reasons.map((reason) => ({ key: reason, header: t(`reasons.${reason}`), kind: "number" as const })),
    { key: "total", header: t("reports.col.total"), kind: "number" },
  ];
  const rows = r.rows.map((x) => ({ month: x.month, ...x.byReason, total: x.total }));
  const footer = { month: t("reports.col.total"), ...r.columnTotals, total: r.grandTotal };

  return (
    <>
      <ReportBar
        hint={t("reports.hint.outByReason")}
        exportHref={`/reports/out-by-reason/export${qs({ from: r.fromMonth, to: r.toMonth, warehouseId })}`}
      />
      <form method="get" className="mb-3 grid gap-2 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
        <label className="grid gap-1 text-sm">
          {t("reports.fromMonth")}
          <Input type="month" name="from" defaultValue={r.fromMonth} className="h-10" />
        </label>
        <label className="grid gap-1 text-sm">
          {t("reports.toMonth")}
          <Input type="month" name="to" defaultValue={r.toMonth} className="h-10" />
        </label>
        <label className="grid gap-1 text-sm">
          {t("entries.warehouse")}
          <NativeSelect name="warehouseId" defaultValue={warehouseId ?? ""}>
            <option value="">{t("entries.allWarehouses")}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit" variant="secondary" className="h-10">
          {t("reports.apply")}
        </Button>
      </form>
      <ReportTable columns={columns} rows={rows} footer={footer} emptyMessage={t("reports.empty")} />
      {!r.transfersInTotal && <p className="mt-2 text-sm text-muted-foreground">{t("reports.transfersExcluded")}</p>}
    </>
  );
}
