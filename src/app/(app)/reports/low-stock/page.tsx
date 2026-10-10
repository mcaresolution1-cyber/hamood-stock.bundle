import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ReportTable, type ReportColumn } from "@/components/reports/report-table";
import { ReportBar, qs } from "@/components/reports/report-bar";
import { CategoryFilter } from "@/components/reports/category-filter";
import { isCategory } from "@/lib/products";
import { requirePagePermission } from "@/server/auth/dal";
import { lowStock } from "@/server/queries/reports";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("reports.tabs"))("lowStock") };
}

export default async function LowStockPage({ searchParams }: PageProps<"/reports/low-stock">) {
  await requirePagePermission("stock:view");
  const raw = (await searchParams).category;
  const category = typeof raw === "string" && isCategory(raw) ? raw : undefined;
  const [t, locale, r] = await Promise.all([getTranslations(), getLocale(), lowStock({ category })]);

  const columns: ReportColumn[] = [
    { key: "modelCode", header: t("reports.col.model"), kind: "code", hrefKey: "href", subKey: "name" },
    ...r.warehouses.map((w) => ({ key: `w_${w.id}`, header: w.name, kind: "number" as const })),
    { key: "total", header: t("reports.col.total"), kind: "number" },
    { key: "level", header: t("reports.col.level"), kind: "number" },
    { key: "shortBy", header: t("reports.col.shortBy"), kind: "number" },
  ];
  const rows = r.rows.map((x) => ({
    modelCode: x.modelCode,
    name: locale === "ar" ? x.nameAr : x.nameEn,
    href: `/products/${x.productId}`,
    ...Object.fromEntries(r.warehouses.map((w) => [`w_${w.id}`, x.qty[w.id] ?? 0])),
    total: x.total,
    level: x.lowStockLevel,
    shortBy: x.shortBy,
  }));

  return (
    <>
      <ReportBar hint={t("reports.hint.lowStock")} exportHref={`/reports/low-stock/export${qs({ category })}`} />
      <CategoryFilter value={category} />
      <ReportTable columns={columns} rows={rows} emptyMessage={t("reports.noLowStock")} />
    </>
  );
}
