import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { FilterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/native-select";
import { Pagination } from "@/components/pagination";
import { Ltr } from "@/components/ltr";
import { MobileCard, ResponsiveList } from "@/components/mobile-list";
import { EntryTypeBadge } from "@/components/entry-badges";
import { requirePagePermission } from "@/server/auth/dal";
import { ENTRY_REASONS, ENTRY_TYPES, entryFilterOptions, listEntries } from "@/server/queries/entries";
import type { EntryReason, EntryType } from "@/generated/prisma/enums";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("entries"))("title") };
}

export default async function EntriesPage({ searchParams }: PageProps<"/entries">) {
  await requirePagePermission("stock:view");
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const filters = {
    from: one("from"),
    to: one("to"),
    warehouseId: one("warehouseId"),
    type: (ENTRY_TYPES as string[]).includes(one("type")) ? (one("type") as EntryType) : undefined,
    reason: (ENTRY_REASONS as string[]).includes(one("reason")) ? (one("reason") as EntryReason) : undefined,
    userId: one("userId"),
    product: one("product"),
    page: Number(one("page")) || 1,
  };
  const [t, tc, format, options, result] = await Promise.all([
    getTranslations(),
    getTranslations("common"),
    getFormatter(),
    entryFilterOptions(),
    listEntries(filters),
  ]);
  const activeFilters = Object.entries(filters).filter(([k, v]) => k !== "page" && v).length;
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  /** Order/invoice number (always LTR) or, failing that, a person's name (any script). */
  const who = (e: (typeof result.rows)[number]) =>
    e.reference ? <Ltr>{e.reference}</Ltr> : <bdi>{e.customerName ?? e.supplierName ?? ""}</bdi>;

  return (
    <>
      <PageHeader title={t("entries.title")} description={t("entries.subtitle")} />

      <details className="mb-4 rounded-lg border" open={activeFilters > 0}>
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium">
          <FilterIcon className="size-4" aria-hidden />
          {t("entries.filter")}
          {activeFilters > 0 && <span className="rounded bg-primary px-1.5 text-xs text-primary-foreground">{activeFilters}</span>}
        </summary>
        <form method="get" className="grid gap-3 border-t p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm">
            {t("entries.from")}
            <Input type="date" name="from" defaultValue={filters.from} className="h-10" />
          </label>
          <label className="grid gap-1 text-sm">
            {t("entries.to")}
            <Input type="date" name="to" defaultValue={filters.to} className="h-10" />
          </label>
          <label className="grid gap-1 text-sm">
            {t("entries.warehouse")}
            <NativeSelect name="warehouseId" defaultValue={filters.warehouseId}>
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
            <NativeSelect name="userId" defaultValue={filters.userId}>
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
            <Input name="product" defaultValue={filters.product} placeholder={t("entries.productPlaceholder")} dir="ltr" className="h-10" />
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" className="h-10 flex-1">
              {t("entries.filter")}
            </Button>
            {activeFilters > 0 && (
              <Button variant="ghost" className="h-10" asChild>
                <Link href="/entries">{tc("clear")}</Link>
              </Button>
            )}
          </div>
        </form>
      </details>

      <p className="mb-2 text-sm text-muted-foreground">{tc("results", { count: result.total })}</p>

      {result.rows.length === 0 ? (
        <EmptyState message={t("entries.empty")} />
      ) : (
        <ResponsiveList
          cards={result.rows.map((e) => (
            <MobileCard key={e.id} muted={Boolean(e.voidedAt) || e.type === "VOID"}>
              <Link href={`/entries/${e.id}`} className="block">
                <div className="flex items-start justify-between gap-2">
                  <Ltr className="font-semibold">{e.number}</Ltr>
                  <EntryTypeBadge type={e.type} voided={Boolean(e.voidedAt)} />
                </div>
                <p className="mt-1 text-sm">
                  {t(`reasons.${e.reason}`)} · {e.warehouse.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {when(e.entryDate)} · {e.createdBy.name}
                </p>
                <p className="mt-1 flex justify-between gap-2 text-sm">
                  <span className="truncate text-muted-foreground">{who(e)}</span>
                  <span className="shrink-0 tabular-nums">{tc("units", { count: e.units })}</span>
                </p>
              </Link>
            </MobileCard>
          ))}
          table={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("entries.number")}</TableHead>
                  <TableHead>{t("entries.date")}</TableHead>
                  <TableHead>{t("entries.type")}</TableHead>
                  <TableHead>{t("entries.reason")}</TableHead>
                  <TableHead>{t("entries.warehouse")}</TableHead>
                  <TableHead>{t("entries.reference")}</TableHead>
                  <TableHead>{t("entries.user")}</TableHead>
                  <TableHead className="text-end">{t("entries.units")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((e) => (
                  <TableRow key={e.id} className={e.voidedAt || e.type === "VOID" ? "text-muted-foreground" : ""}>
                    <TableCell className="font-medium">
                      <Link href={`/entries/${e.id}`} className="underline-offset-4 hover:underline">
                        <Ltr>{e.number}</Ltr>
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{when(e.entryDate)}</TableCell>
                    <TableCell>
                      <EntryTypeBadge type={e.type} voided={Boolean(e.voidedAt)} />
                    </TableCell>
                    <TableCell>{t(`reasons.${e.reason}`)}</TableCell>
                    <TableCell>{e.warehouse.name}</TableCell>
                    <TableCell className="max-w-48 truncate">{who(e)}</TableCell>
                    <TableCell>{e.createdBy.name}</TableCell>
                    <TableCell className="text-end tabular-nums">{e.units}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        />
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        basePath="/entries"
        searchParams={{ ...filters, page: undefined, type: filters.type, reason: filters.reason } as Record<string, string | undefined>}
      />
    </>
  );
}
