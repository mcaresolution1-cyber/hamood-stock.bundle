"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/native-select";
import { categoryName } from "@/lib/categories";
import { MAX_REPORT_DAYS, presetRange, REPORT_PRESETS, reportQuery, type ReportPreset } from "@/lib/inventory-report";
import { addDays } from "@/lib/stock/days";

/**
 * "Generate report" (plan ux-dashboard-report, Part 3): period (presets or custom days), warehouse,
 * category and language → the branded report opens in a new tab, ready to print / save as PDF or Excel.
 */
export function GenerateReportDialog({
  today,
  warehouses,
  categories,
}: {
  /** Today's Riyadh day (from the server, so presets don't depend on the device clock). */
  today: string;
  warehouses: { id: string; name: string }[];
  categories: { id: string; nameEn: string; nameAr: string }[];
}) {
  const t = useTranslations("report");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<ReportPreset>("thisMonth");
  const [range, setRange] = useState(presetRange("thisMonth", today));
  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [lang, setLang] = useState<"en" | "ar">(locale === "ar" ? "ar" : "en");
  const [showAll, setShowAll] = useState(false);

  function choosePreset(p: ReportPreset) {
    setPreset(p);
    if (p !== "custom") setRange(presetRange(p, today));
  }

  const valid =
    range.from && range.to && range.from <= range.to && range.to <= today && range.from >= addDays(range.to, -(MAX_REPORT_DAYS - 1));

  function generate() {
    const q = reportQuery({ ...range, warehouseId: warehouseId || undefined, categoryId: categoryId || undefined, lang, showAll });
    window.open(`/print/report?${q}`, "_blank", "noopener");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 md:h-10">
          <FileTextIcon className="size-4" aria-hidden />
          {t("generate")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("generate")}</DialogTitle>
          <DialogDescription>{t("dialogHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t("period")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {REPORT_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={preset === p}
                  onClick={() => choosePreset(p)}
                  className={`min-h-11 rounded-full border px-3 text-sm md:min-h-9 ${preset === p ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                >
                  {t(`presets.${p}`)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-sm">
                {t("from")}
                <Input
                  type="date"
                  value={range.from}
                  max={today}
                  onChange={(e) => {
                    setPreset("custom");
                    setRange((r) => ({ ...r, from: e.target.value }));
                  }}
                  className="h-11 md:h-10"
                />
              </label>
              <label className="grid gap-1 text-sm">
                {t("to")}
                <Input
                  type="date"
                  value={range.to}
                  max={today}
                  onChange={(e) => {
                    setPreset("custom");
                    setRange((r) => ({ ...r, to: e.target.value }));
                  }}
                  className="h-11 md:h-10"
                />
              </label>
            </div>
            {!valid && <p className="text-sm text-destructive">{t("badRange")}</p>}
          </fieldset>
          <label className="grid gap-1 text-sm">
            {t("warehouse")}
            <NativeSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">{t("allWarehouses")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            {t("category")}
            <NativeSelect value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t("allCategories")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryName(c, locale)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            {t("language")}
            <NativeSelect value={lang} onChange={(e) => setLang(e.target.value === "ar" ? "ar" : "en")}>
              {/* rules-allow: hardcoded-text — each language named in itself, like the language switch */}
              <option value="en">English</option>
              {/* rules-allow: hardcoded-text — each language named in itself, like the language switch */}
              <option value="ar">العربية</option>
            </NativeSelect>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="size-4 accent-primary" />
            {t("showAll")}
          </label>
        </div>
        <DialogFooter>
          <Button type="button" onClick={generate} disabled={!valid}>
            {t("generateButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
