/** Products list as Excel — the same rows (and cost rule) as the page, every page at once. */
import { getLocale, getTranslations } from "next-intl/server";
import { attributeLine } from "@/lib/products";
import { categoryName } from "@/lib/categories";
import { getCurrentUser } from "@/server/auth/dal";
import { routeGuard } from "@/server/export/template";
import { stamp, xlsxFile, type XlsxColumn } from "@/server/export/xlsx";
import { listProducts, parseProductFilters } from "@/server/queries/products";

export async function GET(request: Request) {
  const denied = await routeGuard("product:manage");
  if (denied) return denied;
  const user = (await getCurrentUser())!;
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const filters = parseProductFilters(sp);
  const [t, locale, r] = await Promise.all([getTranslations(), getLocale(), listProducts(user, filters, { all: true })]);

  const columns: XlsxColumn[] = [
    { key: "modelCode", header: t("products.modelCode"), width: 16 },
    { key: "sku", header: t("products.sku"), width: 16 },
    { key: "barcode", header: t("products.barcode"), width: 16 },
    { key: "name", header: t("reports.col.product"), width: 40 },
    { key: "category", header: t("products.category"), width: 18 },
    { key: "details", header: t("products.sections.details"), width: 30 },
    { key: "status", header: t("products.status"), width: 14 },
    ...r.warehouses.map((w) => ({ key: `w_${w.id}`, header: w.name, number: true })),
    { key: "sellable", header: t("products.sellable"), number: true },
    { key: "damaged", header: t("products.damaged"), number: true },
    { key: "price", header: t("products.sellingPrice"), money: true, width: 16 },
    ...(r.showCost
      ? [
          { key: "cost", header: t("reports.col.cost"), money: true },
          { key: "value", header: t("products.value"), money: true, width: 16 },
        ]
      : []),
  ];
  const rows = r.rows.map((p) => ({
    modelCode: p.modelCode,
    sku: p.sku,
    barcode: p.barcode,
    name: locale === "ar" ? p.nameAr : p.nameEn,
    // ", " so the file can be imported again (the import splits on commas)
    category: p.categories.map((c) => categoryName(c.category, locale)).join(", "),
    details: attributeLine(p, t("products.kg")).replace(/[\u2066\u2069]/g, ""), // no invisible marks in Excel
    status: t(`products.statuses.${p.status}`),
    ...Object.fromEntries(r.warehouses.map((w) => [`w_${w.id}`, p.qty[w.id] ?? 0])),
    sellable: p.sellable,
    damaged: p.damaged,
    price: p.sellingPrice,
    ...(r.showCost ? { cost: p.cost ?? null, value: p.value ?? null } : {}),
  }));
  return xlsxFile({ filename: `products-${stamp()}.xlsx`, sheet: t("products.title"), columns, rows, rtl: locale === "ar" });
}
