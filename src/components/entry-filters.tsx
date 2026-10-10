import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FilterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { ENTRY_REASONS, ENTRY_TYPES, entryFilterOptions, type EntryFilters } from "@/server/queries/entries";

/** Collapsible GET filter form shared by the entry list and the movement history report. */
export async function EntryFilterForm({ filters, basePath }: { filters: EntryFilters; basePath: string }) {
  const [t, tc, options] = await Promise.all([getTranslations(), getTranslations("common"), entryFilterOptions()]);
  const activeFilters = Object.entries(filters).filter(([k, v]) => k !== "page" && v).length;
  return (
      <details className="mb-4 rounded-lg border" open={activeFilters > 0}>
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium">
          <FilterIcon className="size-4" aria-hidden />
          {t("entries.filter")}
          {activeFilters > 0 && <span className="rounded bg-primary px-1.5 text-xs text-primary-foreground">{activeFilters}</span>}
        </summary>
        <form method="get" className="grid gap-3 border-t p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm">
            {t("entries.from")}
            <Input type="date" name="from" defaultValue={filters.from ?? ""} className="h-11 md:h-10" />
          </label>
          <label className="grid gap-1 text-sm">
            {t("entries.to")}
            <Input type="date" name="to" defaultValue={filters.to ?? ""} className="h-11 md:h-10" />
          </label>
          <label className="grid gap-1 text-sm">
            {t("entries.warehouse")}
            <NativeSelect name="warehouseId" defaultValue={filters.warehouseId ?? ""}>
              <option value="">{t("entries.allWarehouses")}</option>
              {options.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            {t("entries.type")}
            <NativeSelect name="type" defaultValue={filters.type ?? ""}>
              <option value="">{t("entries.allTypes")}</option>
              {ENTRY_TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`entryTypes.${x}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            {t("entries.reason")}
            <NativeSelect name="reason" defaultValue={filters.reason ?? ""}>
              <option value="">{t("entries.allReasons")}</option>
              {ENTRY_REASONS.map((x) => (
                <option key={x} value={x}>
                  {t(`reasons.${x}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            {t("entries.user")}
            <NativeSelect name="userId" defaultValue={filters.userId ?? ""}>
              <option value="">{t("entries.allUsers")}</option>
              {options.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            {t("entries.product")}
            <Input name="product" defaultValue={filters.product ?? ""} placeholder={t("entries.productPlaceholder")} dir="ltr" className="h-11 md:h-10" />
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" className="h-11 md:h-10 flex-1">
              {t("entries.filter")}
            </Button>
            {activeFilters > 0 && (
              <Button variant="ghost" className="h-11 md:h-10" asChild>
                <Link href={basePath}>{tc("clear")}</Link>
              </Button>
            )}
          </div>
        </form>
      </details>
  );
}
