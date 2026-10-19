/**
 * Branded "Hamood TV Stands" inventory report (plan ux-dashboard-report, Part 3, PX4). Outside the (app)
 * group, so it prints without the sidebar. Download PDF = the browser's print dialog with the A4 print CSS
 * below (no headless browser on Hostinger; Arabic shapes correctly); Download Excel = the export route.
 * The branded header repeats on every page through <thead>; footer and page numbers are @page margin boxes.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeftIcon, FileSpreadsheetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { requirePagePermission } from "@/server/auth/dal";
import { inventoryReport, MOVEMENT_LIST_LIMIT } from "@/server/queries/inventory";
import { parseReportParams, reportQuery } from "@/lib/inventory-report";
import { riyadhDay } from "@/lib/stock/days";

export async function generateMetadata({ searchParams }: PageProps<"/print/report">): Promise<Metadata> {
  const p = parseReportParams(await searchParams, riyadhDay(new Date()));
  const t = await getTranslations({ locale: p.lang, namespace: "report" });
  return { title: `${t("title")} ${p.from} – ${p.to}` };
}

/** CSS text for `content:` — quotes and backslashes escaped. */
const cssText = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export default async function InventoryReportPage({ searchParams }: PageProps<"/print/report">) {
  const user = await requirePagePermission("stock:view");
  const p = parseReportParams(await searchParams, riyadhDay(new Date()));
  const locale = p.lang;
  const [t, tTypes, tReasons, format, r] = await Promise.all([
    getTranslations({ locale, namespace: "report" }),
    getTranslations({ locale, namespace: "entryTypes" }),
    getTranslations({ locale, namespace: "reasons" }),
    getFormatter({ locale }),
    inventoryReport(p),
  ]);
  const rtl = locale === "ar";
  const n = (v: number) => format.number(v, "qty");
  const signed = (v: number) => (v > 0 ? "+" : "") + n(v);
  const day = (d: string) => format.dateTime(new Date(`${d}T12:00:00+03:00`), "date");
  const now = new Date();
  const name = (x: { nameEn: string; nameAr: string }) => (rtl ? x.nameAr : x.nameEn);
  const scope = [
    `${t("period")}: ${day(p.from)} – ${day(p.to)}`,
    `${t("warehouse")}: ${r.warehouse?.name ?? t("allWarehouses")}`,
    `${t("category")}: ${r.category ? name(r.category) : t("allCategories")}`,
  ];
  const totals = r.days.reduce((s, d) => ({ in: s.in + d.in, out: s.out + d.out }), { in: 0, out: 0 });

  const footerLeft = cssText(t("footer"));
  const pageOf = t("pageOf", { page: "\u0001", pages: "\u0002" }).split(/[\u0001\u0002]/);
  const pageContent = `${cssText(pageOf[0])} counter(page) ${cssText(pageOf[1] ?? "")} counter(pages) ${cssText(pageOf[2] ?? "")}`;

  return (
    <div className="min-h-dvh bg-zinc-100 py-6 text-zinc-900 print:bg-white print:py-0">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 14mm 12mm 16mm;
          @bottom-${rtl ? "right" : "left"} { content: ${footerLeft}; font-size: 8pt; color: #71717a; }
          @bottom-${rtl ? "left" : "right"} { content: ${pageContent}; font-size: 8pt; color: #71717a; }
        }
        @media print {
          html, body { background: white !important; }
          .report thead { display: table-header-group; }
          .report tfoot { display: table-row-group; }
          .report table table tr, .report .keep { break-inside: avoid; }
          .report h2 { break-after: avoid; }
          .report .band { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4 print:hidden">
        <Button variant="ghost" className="h-11" asChild>
          <Link href="/">
            <ArrowLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
            {t("back")}
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" asChild>
            <a href={`/print/report/export?${reportQuery(p)}`} download>
              <FileSpreadsheetIcon className="size-4" aria-hidden />
              {t("downloadExcel")}
            </a>
          </Button>
          <PrintButton label={t("downloadPdf")} pdf />
        </div>
      </div>
      <p className="mx-auto mb-3 max-w-[210mm] px-4 text-xs text-zinc-500 print:hidden">{t("pdfHint")}</p>

      <article
        dir={rtl ? "rtl" : "ltr"}
        lang={locale}
        className="report mx-auto max-w-[210mm] bg-white p-[12mm] text-[10pt] leading-snug shadow print:max-w-none print:p-0 print:shadow-none"
      >
        {/* table-fixed: a long movements table may not widen the page past A4 */}
        <table className="w-full table-fixed border-collapse">
          {/* Branded header — repeated on every printed page */}
          <thead>
            <tr>
              <td className="pb-4">
                <div className="band flex items-center gap-3 rounded-md bg-brand px-4 py-3 text-brand-foreground">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, prints as is */}
                  <img src="/brand/logo.svg" alt="" width={40} height={40} className="size-10 rounded bg-white/10" />
                  <div className="min-w-0 flex-1">
                    {/* The brand name is shown in both languages whatever the report language. */}
                    <p className="text-base font-bold leading-tight">
                      {/* rules-allow: hardcoded-text — brand name, the same in every language */}
                      Hamood TV Stands ·{" "}
                      {/* rules-allow: hardcoded-text — brand name, the same in every language */}
                      <span lang="ar">حمود للطاولات</span>
                    </p>
                    <p className="text-sm opacity-90">{t("title")}</p>
                  </div>
                  <div className="text-end text-[8pt] leading-tight opacity-90">
                    <p>{t("generated", { date: format.dateTime(now, "dateTime") })}</p>
                    <p>{t("by", { name: user.name })}</p>
                  </div>
                </div>
                <p className="mt-2 text-[8.5pt] text-zinc-600">{scope.join(" · ")}</p>
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="space-y-6 align-top">
                {/* Summary */}
                <section className="keep">
                  <h2 className="mb-2 text-sm font-bold text-brand">{t("summary")}</h2>
                  <dl className="grid grid-cols-5 gap-1.5">
                    {[
                      [t("opening"), n(r.summary.opening)],
                      [t("in"), n(r.summary.in)],
                      [t("out"), n(r.summary.out)],
                      [t("closing"), n(r.summary.closing)],
                      [t("entries"), n(r.summary.entries)],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 rounded border border-zinc-200 p-2">
                        <dt className="text-[8pt] text-zinc-500">{label}</dt>
                        <dd className="text-base font-bold tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-1 text-[8pt] text-zinc-500">{t(r.warehouse ? "rulesOne" : "rulesAll")}</p>
                </section>

                {/* Daily breakdown */}
                <section>
                  <h2 className="mb-2 text-sm font-bold text-brand">{t("daily")}</h2>
                  <table className="w-full border-collapse text-[9pt]">
                    <thead>
                      <tr className="border-b-2 border-zinc-300 text-start [&>th]:px-1.5 [&>th]:py-1 [&>th]:font-semibold">
                        <th className="text-start">{t("date")}</th>
                        <th className="text-end">{t("in")}</th>
                        <th className="text-end">{t("out")}</th>
                        <th className="text-end">{t("net")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.days.map((d) => (
                        <tr key={d.day} className="border-b border-zinc-100 [&>td]:px-1.5 [&>td]:py-0.5">
                          <td>{day(d.day)}</td>
                          <td className="text-end tabular-nums">{d.in ? n(d.in) : "–"}</td>
                          <td className="text-end tabular-nums">{d.out ? n(d.out) : "–"}</td>
                          <td className="text-end tabular-nums">
                            <bdi dir="ltr">{d.in - d.out ? signed(d.in - d.out) : "–"}</bdi>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-zinc-300 font-bold [&>td]:px-1.5 [&>td]:py-1">
                        <td>{t("total")}</td>
                        <td className="text-end tabular-nums">{n(totals.in)}</td>
                        <td className="text-end tabular-nums">{n(totals.out)}</td>
                        <td className="text-end tabular-nums">
                          <bdi dir="ltr">{signed(totals.in - totals.out)}</bdi>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </section>

                {/* Per product */}
                <section>
                  <h2 className="mb-2 text-sm font-bold text-brand">{t("products")}</h2>
                  {r.products.length === 0 ? (
                    <p className="text-zinc-500">{t("noProducts")}</p>
                  ) : (
                    <table className="w-full table-fixed border-collapse text-[9pt] [&_td]:[overflow-wrap:anywhere]">
                      <colgroup>
                        <col className="w-[22%]" />
                        <col className="w-[26%]" />
                        <col className="w-[12%]" />
                        <col className="w-[10%]" />
                        <col className="w-[10%]" />
                        <col className="w-[10%]" />
                        <col className="w-[10%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b-2 border-zinc-300 [&>th]:px-1.5 [&>th]:py-1 [&>th]:font-semibold">
                          <th className="text-start">{t("model")}</th>
                          <th className="text-start">{t("name")}</th>
                          <th className="text-start">{t("sku")}</th>
                          <th className="text-end">{t("opening")}</th>
                          <th className="text-end">{t("in")}</th>
                          <th className="text-end">{t("out")}</th>
                          <th className="text-end">{t("closing")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.products.map((x) => (
                          <tr key={x.productId} className="border-b border-zinc-100 [&>td]:px-1.5 [&>td]:py-0.5">
                            <td className="font-medium">
                              <bdi dir="ltr">{x.modelCode}</bdi>
                            </td>
                            <td className="max-w-[60mm]">
                              <bdi>{name(x)}</bdi>
                            </td>
                            <td className="whitespace-nowrap">
                              <bdi dir="ltr">{x.sku}</bdi>
                            </td>
                            <td className="text-end tabular-nums">{n(x.opening)}</td>
                            <td className="text-end tabular-nums">{x.in ? n(x.in) : "–"}</td>
                            <td className="text-end tabular-nums">{x.out ? n(x.out) : "–"}</td>
                            <td className="text-end font-semibold tabular-nums">{n(x.closing)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-zinc-300 font-bold [&>td]:px-1.5 [&>td]:py-1">
                          <td colSpan={3}>{t("totalProducts", { count: r.products.length })}</td>
                          <td className="text-end tabular-nums">{n(r.summary.opening)}</td>
                          <td className="text-end tabular-nums">{n(r.summary.in)}</td>
                          <td className="text-end tabular-nums">{n(r.summary.out)}</td>
                          <td className="text-end tabular-nums">{n(r.summary.closing)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                  {!p.showAll && <p className="mt-1 text-[8pt] text-zinc-500">{t("hiddenProducts")}</p>}
                </section>

                {/* Movements */}
                <section>
                  <h2 className="mb-2 text-sm font-bold text-brand">{t("movements")}</h2>
                  {r.lines.rows.length === 0 ? (
                    <p className="text-zinc-500">{t("noMovements")}</p>
                  ) : (
                    <table className="w-full table-fixed border-collapse text-[8pt] [&_td]:[overflow-wrap:anywhere]">
                      <colgroup>
                        <col className="w-[17%]" />
                        <col className="w-[12%]" />
                        <col className="w-[17%]" />
                        <col className="w-[11%]" />
                        <col className="w-[13%]" />
                        <col className="w-[7%]" />
                        <col className="w-[12%]" />
                        <col className="w-[11%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b-2 border-zinc-300 [&>th]:px-1 [&>th]:py-1 [&>th]:font-semibold">
                          <th className="text-start">{t("date")}</th>
                          <th className="text-start">{t("entryNo")}</th>
                          <th className="text-start">{t("type")}</th>
                          <th className="text-start">{t("warehouse")}</th>
                          <th className="text-start">{t("model")}</th>
                          <th className="text-end">{t("qty")}</th>
                          <th className="text-start">{t("reference")}</th>
                          <th className="text-start">{t("recordedBy")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.lines.rows.map((l, i) => (
                          <tr key={i} className="border-b border-zinc-100 [&>td]:px-1 [&>td]:py-0.5">
                            <td>{format.dateTime(l.entryDate, "dateTime")}</td>
                            <td className="whitespace-nowrap">
                              <bdi dir="ltr">{l.number}</bdi>
                            </td>
                            <td>
                              {tTypes(l.type as "IN")} · {tReasons(l.reason as "OPENING_STOCK")}
                            </td>
                            <td>
                              <bdi>{l.warehouse}</bdi>
                            </td>
                            <td>
                              <bdi dir="ltr">{l.modelCode}</bdi>
                            </td>
                            <td className="text-end tabular-nums">
                              <bdi dir="ltr">{signed(l.quantity)}</bdi>
                            </td>
                            <td>
                              <bdi dir="ltr">{l.reference ?? ""}</bdi>
                            </td>
                            <td>
                              <bdi>{l.user}</bdi>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {r.lines.truncated && <p className="mt-1 text-[8pt] text-zinc-500">{t("truncated", { count: MOVEMENT_LIST_LIMIT })}</p>}
                </section>
              </td>
            </tr>
          </tbody>
        </table>
      </article>
    </div>
  );
}
