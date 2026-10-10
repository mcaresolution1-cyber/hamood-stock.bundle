/**
 * Report → Excel. Each builder runs the SAME query as the page and turns its rows into columns.
 * The caller (route handler) has already checked access; cost/value columns appear only when the
 * query returned them (ADMIN).
 */
import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { isCategory } from "@/lib/products";
import type { CurrentUser } from "@/server/auth/dal";
import type { EntryFilters } from "@/server/queries/entries";
import { lowStock, movements, outByReason, stockOnHand } from "@/server/queries/reports";
import { stamp, xlsxFile, type XlsxColumn } from "./xlsx";

async function i18n() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations()]);
  const name = (p: { nameEn: string; nameAr: string }) => (locale === "ar" ? p.nameAr : p.nameEn);
  const category = (c: string) => (isCategory(c) ? t(`categories.${c}`) : c);
  return { locale, t, name, category, rtl: locale === "ar" };
}

export async function stockOnHandXlsx(user: CurrentUser, filters: { category?: string }) {
  const { t, name, category, rtl } = await i18n();
  const r = await stockOnHand(user, filters);
  const columns: XlsxColumn[] = [
    { key: "modelCode", header: t("reports.col.model"), width: 16 },
    { key: "name", header: t("reports.col.product"), width: 40 },
    { key: "category", header: t("products.category"), width: 20 },
    ...r.warehouses.map((w) => ({ key: `w_${w.id}`, header: w.name, number: true })),
    { key: "total", header: t("reports.col.total"), number: true },
    ...(r.showCost
      ? [
          { key: "cost", header: t("reports.col.cost"), money: true },
          { key: "value", header: t("reports.col.value"), money: true, width: 16 },
        ]
      : []),
  ];
  const rows = r.rows.map((x) => ({
    modelCode: x.modelCode,
    name: name(x),
    category: category(x.category),
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
  return xlsxFile({
    filename: `stock-on-hand-${stamp()}.xlsx`,
    sheet: t("reports.tabs.stockOnHand"),
    columns,
    rows,
    footer,
    rtl,
    note: r.showCost && r.totals.missingCost ? t("reports.noCost", { count: r.totals.missingCost }) : undefined,
  });
}

export async function movementsXlsx(filters: EntryFilters) {
  const { t, name, rtl } = await i18n();
  const r = await movements(filters, { all: true });
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" });
  return xlsxFile({
    filename: `movements-${stamp()}.xlsx`,
    sheet: t("reports.tabs.movements"),
    columns: [
      { key: "date", header: t("entries.date"), width: 18 },
      { key: "number", header: t("entries.number"), width: 16 },
      { key: "type", header: t("entries.type"), width: 16 },
      { key: "reason", header: t("entries.reason"), width: 20 },
      { key: "warehouse", header: t("entries.warehouse"), width: 18 },
      { key: "modelCode", header: t("reports.col.model"), width: 16 },
      { key: "name", header: t("reports.col.product"), width: 36 },
      { key: "quantity", header: t("reports.col.change"), number: true },
      { key: "reference", header: t("entries.reference"), width: 18 },
      { key: "user", header: t("entries.user"), width: 16 },
      { key: "voided", header: t("entries.voided"), width: 10 },
    ],
    rows: r.rows.map((x) => ({
      date: date.format(x.date),
      number: x.number,
      type: t(`entryTypes.${x.type}`),
      reason: t(`reasons.${x.reason}`),
      warehouse: x.warehouse,
      modelCode: x.modelCode,
      name: name(x),
      quantity: x.quantity,
      reference: x.reference,
      user: x.user,
      voided: x.voided ? t("common.yes") : "",
    })),
    rtl,
    note: r.truncated ? t("reports.truncated") : undefined,
  });
}

export async function lowStockXlsx(filters: { category?: string }) {
  const { t, name, category, rtl } = await i18n();
  const r = await lowStock(filters);
  return xlsxFile({
    filename: `low-stock-${stamp()}.xlsx`,
    sheet: t("reports.tabs.lowStock"),
    columns: [
      { key: "modelCode", header: t("reports.col.model"), width: 16 },
      { key: "name", header: t("reports.col.product"), width: 40 },
      { key: "category", header: t("products.category"), width: 20 },
      ...r.warehouses.map((w) => ({ key: `w_${w.id}`, header: w.name, number: true })),
      { key: "total", header: t("reports.col.total"), number: true },
      { key: "level", header: t("reports.col.level"), number: true },
      { key: "shortBy", header: t("reports.col.shortBy"), number: true },
    ],
    rows: r.rows.map((x) => ({
      modelCode: x.modelCode,
      name: name(x),
      category: category(x.category),
      ...Object.fromEntries(r.warehouses.map((w) => [`w_${w.id}`, x.qty[w.id] ?? 0])),
      total: x.total,
      level: x.lowStockLevel,
      shortBy: x.shortBy,
    })),
    rtl,
  });
}

export async function outByReasonXlsx(filters: { from?: string; to?: string; warehouseId?: string }) {
  const { t, rtl } = await i18n();
  const r = await outByReason(filters);
  return xlsxFile({
    filename: `stock-out-by-reason-${r.fromMonth}-to-${r.toMonth}.xlsx`,
    sheet: t("reports.tabs.outByReason"),
    columns: [
      { key: "month", header: t("reports.col.month"), width: 12 },
      ...r.reasons.map((reason) => ({ key: reason, header: t(`reasons.${reason}`), number: true, width: 14 })),
      { key: "total", header: t("reports.col.total"), number: true },
    ],
    rows: r.rows.map((x) => ({ month: x.month, ...x.byReason, total: x.total })),
    footer: { month: t("reports.col.total"), ...r.columnTotals, total: r.grandTotal },
    rtl,
    note: r.transfersInTotal ? undefined : t("reports.transfersExcluded"),
  });
}
