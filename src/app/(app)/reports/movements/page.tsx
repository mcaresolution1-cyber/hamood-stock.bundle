import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ReportTable, type ReportColumn } from "@/components/reports/report-table";
import { ReportBar, qs } from "@/components/reports/report-bar";
import { EntryFilterForm } from "@/components/entry-filters";
import { Pagination } from "@/components/pagination";
import { requirePagePermission } from "@/server/auth/dal";
import { parseEntryFilters } from "@/server/queries/entries";
import { movements } from "@/server/queries/reports";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("reports.tabs"))("movements") };
}

export default async function MovementsPage({ searchParams }: PageProps<"/reports/movements">) {
  await requirePagePermission("stock:view");
  const filters = parseEntryFilters(await searchParams);
  const [t, tc, format, locale, r] = await Promise.all([
    getTranslations(),
    getTranslations("common"),
    getFormatter(),
    getLocale(),
    movements(filters, { page: filters.page }),
  ]);
  const exportFilters = { ...filters, page: undefined };

  const columns: ReportColumn[] = [
    { key: "date", header: t("entries.date"), sortKey: "at" },
    { key: "number", header: t("entries.number"), kind: "code", hrefKey: "href" },
    { key: "type", header: t("entries.type"), subKey: "reason" },
    { key: "warehouse", header: t("entries.warehouse") },
    { key: "modelCode", header: t("reports.col.model"), kind: "code", subKey: "name", hrefKey: "productHref" },
    { key: "quantity", header: t("reports.col.change"), kind: "signed" },
    { key: "reference", header: t("entries.reference") },
    { key: "user", header: t("entries.user") },
  ];
  const rows = r.rows.map((x) => ({
    date: format.dateTime(x.date, { dateStyle: "short", timeStyle: "short" }),
    at: x.date.getTime(),
    number: x.number,
    href: `/entries/${x.entryId}`,
    type: t(`entryTypes.${x.type}`),
    reason: t(`reasons.${x.reason}`),
    warehouse: x.warehouse,
    modelCode: x.modelCode,
    name: locale === "ar" ? x.nameAr : x.nameEn,
    productHref: `/products/${x.productId}`,
    quantity: x.quantity,
    reference: x.reference,
    user: x.user,
    voided: x.voided,
  }));

  return (
    <>
      <ReportBar hint={t("reports.hint.movements")} exportHref={`/reports/movements/export${qs(exportFilters)}`} />
      <EntryFilterForm filters={filters} basePath="/reports/movements" />
      <p className="mb-2 text-sm text-muted-foreground">{tc("results", { count: r.total })}</p>
      <ReportTable columns={columns} rows={rows} mutedKey="voided" emptyMessage={t("reports.empty")} />
      <Pagination
        page={r.page}
        pageCount={r.pageCount}
        basePath="/reports/movements"
        searchParams={exportFilters as Record<string, string | undefined>}
      />
    </>
  );
}
