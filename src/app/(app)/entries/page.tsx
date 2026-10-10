import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Ltr } from "@/components/ltr";
import { MobileCard, ResponsiveList } from "@/components/mobile-list";
import { EntryTypeBadge } from "@/components/entry-badges";
import { requirePagePermission } from "@/server/auth/dal";
import { listEntries, parseEntryFilters } from "@/server/queries/entries";
import { EntryFilterForm } from "@/components/entry-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("entries"))("title") };
}

export default async function EntriesPage({ searchParams }: PageProps<"/entries">) {
  await requirePagePermission("stock:view");
  const filters = parseEntryFilters(await searchParams);
  const [t, tc, format, result] = await Promise.all([
    getTranslations(),
    getTranslations("common"),
    getFormatter(),
    listEntries(filters),
  ]);
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  /** Order/invoice number (always LTR) or, failing that, a person's name (any script). */
  const who = (e: (typeof result.rows)[number]) =>
    e.reference ? <Ltr>{e.reference}</Ltr> : <bdi>{e.customerName ?? e.supplierName ?? ""}</bdi>;

  return (
    <>
      <PageHeader title={t("entries.title")} description={t("entries.subtitle")} />

      <EntryFilterForm filters={filters} basePath="/entries" />

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
        searchParams={{ ...filters, page: undefined } as Record<string, string | undefined>}
      />
    </>
  );
}
