/** The inventory report as Excel: summary, daily, products and movements sheets — the same numbers as the page. */
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/server/auth/dal";
import { routeGuard } from "@/server/export/template";
import { xlsxWorkbook } from "@/server/export/xlsx";
import { inventoryReport, MOVEMENT_LIST_LIMIT } from "@/server/queries/inventory";
import { parseReportParams } from "@/lib/inventory-report";
import { riyadhDay } from "@/lib/stock/days";

export async function GET(request: Request) {
  const denied = await routeGuard("stock:view");
  if (denied) return denied;
  const user = (await getCurrentUser())!;
  const p = parseReportParams(Object.fromEntries(new URL(request.url).searchParams), riyadhDay(new Date()));
  const locale = p.lang;
  const [t, tTypes, tReasons, r] = await Promise.all([
    getTranslations({ locale, namespace: "report" }),
    getTranslations({ locale, namespace: "entryTypes" }),
    getTranslations({ locale, namespace: "reasons" }),
    inventoryReport(p),
  ]);
  const rtl = locale === "ar";
  const name = (x: { nameEn: string; nameAr: string }) => (rtl ? x.nameAr : x.nameEn);
  const riyadh = new Intl.DateTimeFormat(rtl ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" });
  const title = [
    `Hamood TV Stands · حمود للطاولات — ${t("title")}`,
    `${t("period")}: ${p.from} – ${p.to} · ${t("warehouse")}: ${r.warehouse?.name ?? t("allWarehouses")} · ${t("category")}: ${r.category ? name(r.category) : t("allCategories")}`,
    `${t("generated", { date: riyadh.format(new Date()) })} · ${t("by", { name: user.name })}`,
  ];
  const totals = r.days.reduce((s, d) => ({ in: s.in + d.in, out: s.out + d.out }), { in: 0, out: 0 });

  return xlsxWorkbook({
    filename: `inventory-report-${p.from}-${p.to}.xlsx`,
    rtl,
    sheets: [
      {
        name: t("summary"),
        title,
        columns: [
          { key: "label", header: t("summary"), width: 28 },
          { key: "value", header: t("units"), number: true, width: 14 },
        ],
        rows: [
          { label: t("opening"), value: r.summary.opening },
          { label: t("in"), value: r.summary.in },
          { label: t("out"), value: r.summary.out },
          { label: t("closing"), value: r.summary.closing },
          { label: t("entries"), value: r.summary.entries },
        ],
        note: t(r.warehouse ? "rulesOne" : "rulesAll"),
      },
      {
        name: t("daily"),
        title,
        columns: [
          { key: "day", header: t("date"), width: 14 },
          { key: "in", header: t("in"), number: true },
          { key: "out", header: t("out"), number: true },
          { key: "net", header: t("net"), number: true },
        ],
        rows: r.days.map((d) => ({ day: d.day, in: d.in, out: d.out, net: d.in - d.out })),
        footer: { day: t("total"), in: totals.in, out: totals.out, net: totals.in - totals.out },
      },
      {
        name: t("products"),
        title,
        columns: [
          { key: "model", header: t("model"), width: 18 },
          { key: "name", header: t("name"), width: 36 },
          { key: "sku", header: t("sku"), width: 14 },
          { key: "opening", header: t("opening"), number: true },
          { key: "in", header: t("in"), number: true },
          { key: "out", header: t("out"), number: true },
          { key: "closing", header: t("closing"), number: true },
        ],
        rows: r.products.map((x) => ({ model: x.modelCode, name: name(x), sku: x.sku, opening: x.opening, in: x.in, out: x.out, closing: x.closing })),
        footer: { model: t("total"), opening: r.summary.opening, in: r.summary.in, out: r.summary.out, closing: r.summary.closing },
      },
      {
        name: t("movements"),
        title,
        columns: [
          { key: "date", header: t("date"), width: 18 },
          { key: "number", header: t("entryNo"), width: 16 },
          { key: "type", header: t("type"), width: 28 },
          { key: "warehouse", header: t("warehouse"), width: 18 },
          { key: "model", header: t("model"), width: 18 },
          { key: "qty", header: t("qty"), number: true },
          { key: "reference", header: t("reference"), width: 18 },
          { key: "user", header: t("recordedBy"), width: 18 },
        ],
        rows: r.lines.rows.map((l) => ({
          date: riyadh.format(l.entryDate),
          number: l.number,
          type: `${tTypes(l.type as "IN")} · ${tReasons(l.reason as "OPENING_STOCK")}`,
          warehouse: l.warehouse,
          model: l.modelCode,
          qty: l.quantity,
          reference: l.reference,
          user: l.user,
        })),
        note: r.lines.truncated ? t("truncated", { count: MOVEMENT_LIST_LIMIT }) : undefined,
      },
    ],
  });
}
