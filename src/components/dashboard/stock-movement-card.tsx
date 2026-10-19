"use client";

import { useState, useTransition } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/native-select";
import { useMessage } from "@/components/use-message";
import { runAction } from "@/lib/run-action";
import { cn } from "@/lib/utils";
import type { DayMovement } from "@/server/queries/inventory";
import { loadStockMovement } from "@/server/actions/dashboard";

/** The Stock in / Stock out colours of the dashboard buttons (emerald-600 / amber-500). */
const IN_COLOR = "#059669";
const OUT_COLOR = "#f59e0b";
const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

/**
 * "Stock movement" on the dashboard (plan ux-dashboard-report): units in and out per day as grouped bars,
 * 7 / 30 / 90 days, one or all warehouses, opening stock optional. Totals under the chart; a hidden table
 * for screen readers. In Arabic the days run right to left, still in time order.
 */
export function StockMovementCard({ initial, warehouses }: { initial: DayMovement[]; warehouses: { id: string; name: string }[] }) {
  const t = useTranslations("dashboard.movement");
  const format = useFormatter();
  const locale = useLocale();
  const message = useMessage();
  const rtl = locale === "ar";
  const [data, setData] = useState(initial);
  const [days, setDays] = useState<Range>(30);
  const [warehouseId, setWarehouseId] = useState("");
  const [includeOpening, setIncludeOpening] = useState(false);
  const [pending, startTransition] = useTransition();

  function reload(next: { days?: Range; warehouseId?: string; includeOpening?: boolean }) {
    const v = { days, warehouseId, includeOpening, ...next };
    setDays(v.days);
    setWarehouseId(v.warehouseId);
    setIncludeOpening(v.includeOpening);
    startTransition(async () => {
      const result = await runAction(() => loadStockMovement(v), { retry: true });
      if (result.ok) setData(result.data);
      else toast.error(message(result.error, result.params));
    });
  }

  const n = (v: number) => format.number(v, "qty");
  const dayLabel = (day: string, long = false) =>
    format.dateTime(new Date(`${day}T12:00:00+03:00`), long ? { weekday: "short", day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
  const totals = data.reduce((s, d) => ({ in: s.in + d.in, out: s.out + d.out }), { in: 0, out: 0 });
  const net = totals.in - totals.out;

  function TooltipBox({ active, payload, label }: TooltipContentProps<number, string>) {
    if (!active || !payload?.length) return null;
    const d = data.find((x) => x.day === label);
    if (!d) return null;
    return (
      <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
        <p className="mb-1 font-medium">{dayLabel(d.day, true)}</p>
        <p className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm" style={{ background: IN_COLOR }} aria-hidden />
          {t("in")}: <span className="ms-auto tabular-nums">{n(d.in)}</span>
        </p>
        <p className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm" style={{ background: OUT_COLOR }} aria-hidden />
          {t("out")}: <span className="ms-auto tabular-nums">{n(d.out)}</span>
        </p>
        <p className="mt-1 border-t pt-1">
          {t("net")}: <span className="tabular-nums" dir="ltr">{(d.in - d.out > 0 ? "+" : "") + n(d.in - d.out)}</span>
        </p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        {/* Filters in one row above the chart */}
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t("range")} className="inline-flex rounded-md border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={days === r}
                onClick={() => reload({ days: r })}
                className={cn("min-h-11 rounded px-3 text-sm md:min-h-9", days === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
              >
                {t("days", { count: r })}
              </button>
            ))}
          </div>
          <NativeSelect aria-label={t("warehouse")} value={warehouseId} onChange={(e) => reload({ warehouseId: e.target.value })} className="h-11 w-auto min-w-44 md:h-9">
            <option value="">{t("allWarehouses")}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </NativeSelect>
          <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground md:min-h-9">
            <input type="checkbox" checked={includeOpening} onChange={(e) => reload({ includeOpening: e.target.checked })} className="size-4 accent-primary" />
            {t("includeOpening")}
          </label>
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-4 transition-opacity", pending && "opacity-60")}>
        {/* Legend (identity is never colour alone) */}
        <div className="flex gap-4 text-xs text-muted-foreground" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: IN_COLOR }} />
            {t("in")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: OUT_COLOR }} />
            {t("out")}
          </span>
        </div>
        <div className="h-64 w-full" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} barCategoryGap={days === 7 ? "30%" : "15%"} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.08} />
              <XAxis
                dataKey="day"
                reversed={rtl}
                tickFormatter={(d: string) => dayLabel(d)}
                tickLine={false}
                axisLine={false}
                minTickGap={16}
                tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
              />
              <YAxis
                orientation={rtl ? "right" : "left"}
                tickFormatter={(v: number) => n(v)}
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                allowDecimals={false}
              />
              <Tooltip content={TooltipBox} cursor={{ fill: "currentColor", fillOpacity: 0.05 }} />
              <Bar dataKey="in" fill={IN_COLOR} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              <Bar dataKey="out" fill={OUT_COLOR} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <dl className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
          <div>
            <dt className="text-xs text-muted-foreground">{t("totalIn")}</dt>
            <dd className="text-lg font-semibold tabular-nums">{n(totals.in)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("totalOut")}</dt>
            <dd className="text-lg font-semibold tabular-nums">{n(totals.out)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("netChange")}</dt>
            <dd className="text-lg font-semibold tabular-nums" dir="ltr">
              {(net > 0 ? "+" : "") + n(net)}
            </dd>
          </div>
        </dl>
        {/* The same numbers as a table, for screen readers */}
        <table className="sr-only">
          <caption>{t("title")}</caption>
          <thead>
            <tr>
              <th>{t("day")}</th>
              <th>{t("in")}</th>
              <th>{t("out")}</th>
              <th>{t("net")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day}>
                <td>{dayLabel(d.day, true)}</td>
                <td>{n(d.in)}</td>
                <td>{n(d.out)}</td>
                <td>{n(d.in - d.out)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
