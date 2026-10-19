/** Inventory report settings (plan ux-dashboard-report, Part 3). Pure: shared by the dialog, page and export. */
import { addDays, isDay } from "@/lib/stock/days";

export const REPORT_PRESETS = ["today", "yesterday", "last7", "thisMonth", "lastMonth", "custom"] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

/** The days a preset covers, given today's Riyadh day. */
export function presetRange(preset: Exclude<ReportPreset, "custom">, today: string): { from: string; to: string } {
  const month = today.slice(0, 7);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "thisMonth":
      return { from: `${month}-01`, to: today };
    case "lastMonth": {
      const lastDay = addDays(`${month}-01`, -1);
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
    }
  }
}

export type ReportParams = {
  from: string;
  to: string;
  warehouseId?: string;
  categoryId?: string;
  lang: "en" | "ar";
  showAll: boolean;
};

/** Longest range one report covers (a daily table of more than a year is not a report any more). */
export const MAX_REPORT_DAYS = 366;

/**
 * URL → settings. Bad or missing values fall back (this month, English); from/to are swapped when
 * reversed and the range is capped at MAX_REPORT_DAYS. Never throws.
 */
export function parseReportParams(sp: Record<string, string | string[] | undefined>, today: string): ReportParams {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  let from = one("from");
  let to = one("to");
  if (!isDay(from) || !isDay(to)) ({ from, to } = presetRange("thisMonth", today));
  if (from > to) [from, to] = [to, from];
  if (to > today) to = today;
  if (from > to) from = to;
  const earliest = addDays(to, -(MAX_REPORT_DAYS - 1));
  if (from < earliest) from = earliest;
  const id = (k: string) => (/^[\w-]{1,64}$/.test(one(k)) ? one(k) : undefined);
  return {
    from,
    to,
    warehouseId: id("warehouse"),
    categoryId: id("category"),
    lang: one("lang") === "ar" ? "ar" : "en",
    showAll: one("all") === "1",
  };
}

/** Settings → query string for the report page and its Excel export. */
export function reportQuery(p: ReportParams): string {
  const q = new URLSearchParams({ from: p.from, to: p.to, lang: p.lang });
  if (p.warehouseId) q.set("warehouse", p.warehouseId);
  if (p.categoryId) q.set("category", p.categoryId);
  if (p.showAll) q.set("all", "1");
  return q.toString();
}
