import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ReportTable, type ReportColumn } from "@/components/reports/report-table";
import { ReportBar, qs } from "@/components/reports/report-bar";
import { CategoryFilter } from "@/components/reports/category-filter";
import { isCategory } from "@/lib/products";
import { requirePagePermission } from "@/server/auth/dal";
import { stockOnHand } from "@/server/queries/reports";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("reports.tabs"))("stockOnHand") };
}

export default async function StockOnHandPage({ searchParams }: PageProps<"/reports/stock-on-hand">) {
  const user = await requirePagePermission("stock:view");
  const raw = (await searchParams).category;
  const category = typeof raw === "string" && isCategory(raw) ? raw : undefined;
  const [t, locale, r] = await Promise.all([getTranslations(), getLocale(), stockOnHand(user, { category })]);

  const columns: ReportColumn[] = [
    { key: "modelCode", header: t("reports.col.model"), kind: "code", hrefKey: "href", subKey: "name" },
    ...r.warehouses.map((w) => ({ key: `w_${w.id}`, header: w.name, kind: "number" as const })),
    { key: "total", header: t("reports.col.total"), kind: "number" },
    ...(r.showCost
      ? [
          { key: "cost", header: t("reports.col.cost"), kind: "number" as const },
          { key: "value", header: t("reports.col.value"), kind: "number" as const },
        ]
      : []),
  ];
  const rows = r.rows.map((x) => ({
    modelCode: x.modelCode,
    name: locale === "ar" ? x.nameAr : x.nameEn,
    href: `/products/${x.productId}`,
    ...Object.fromEntries(r.warehouses.map((w) => [`w_${w.id}`, x.qty[w.id] ?? 0])),
    total: x.total,
    ...(r.showCost ? { cost: x.cost ?? null, value: x.value ?? null } : {}),
  }));
  const footer = {
    modelCode: t("reports.col.total"),
    ...Object.fromEntries(r.warehouses.map((w) => [`w_${w.id}`, r.totals.perWarehouse[w.id]])),
    total: r.totals.units,
    ...(r.showCost ? { value: r.totals.value } : {}),
  };

  return (
    <>
      <ReportBar hint={t("reports.hint.stockOnHand")} exportHref={`/reports/stock-on-hand/export${qs({ category })}`} />
      <CategoryFilter value={category} />
      <ReportTable columns={columns} rows={rows} footer={footer} emptyMessage={t("reports.empty")} />
      {r.showCost && r.totals.missingCost ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("reports.noCost", { count: r.totals.missingCost })}</p>
      ) : null}
    </>
  );
}
