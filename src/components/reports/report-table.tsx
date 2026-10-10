"use client";

/**
 * Sortable report table (@tanstack/react-table v9). Takes plain, serialisable column specs and rows
 * from a server component — the same rows the Excel export writes. Click a header to sort.
 */
import Link from "next/link";
import { useMemo } from "react";
import {
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Ltr } from "@/components/ltr";
import { cn } from "@/lib/utils";

export type Cell = string | number | boolean | null | undefined;
export type ReportRow = Record<string, Cell>;
export type ReportColumn = {
  key: string;
  header: string;
  kind?: "text" | "number" | "code" | "signed";
  /** Row key holding a URL; the cell becomes a link. */
  hrefKey?: string;
  /** Row key holding a secondary line shown under the value. */
  subKey?: string;
  /** Row key holding the value to sort by (e.g. an ISO date behind a formatted one). */
  sortKey?: string;
};

/** Sort value: numbers as numbers (Decimal strings included, missing = lowest), text as text. */
function sortValue(c: ReportColumn, r: ReportRow): string | number {
  const v = r[c.sortKey ?? c.key];
  if (c.kind === "number" || c.kind === "signed") {
    const n = v === null || v === undefined || v === "" ? NaN : Number(v);
    return Number.isNaN(n) ? Number.NEGATIVE_INFINITY : n;
  }
  if (typeof v === "number") return v;
  return v === null || v === undefined ? "" : String(v);
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});

function render(col: ReportColumn, row: ReportRow) {
  const v = row[col.key];
  let content: React.ReactNode =
    v === null || v === undefined || v === "" ? "—" : col.kind === "signed" && typeof v === "number" && v > 0 ? `+${v}` : String(v);
  if (col.kind === "code") content = <Ltr>{content}</Ltr>;
  if (col.kind === "signed" || col.kind === "number") content = <span dir="ltr">{content}</span>;
  if (col.hrefKey && row[col.hrefKey]) {
    content = (
      <Link href={String(row[col.hrefKey])} className="font-medium underline-offset-4 hover:underline">
        {content}
      </Link>
    );
  }
  return (
    <>
      {content}
      {col.subKey && row[col.subKey] ? <div className="text-xs text-muted-foreground">{String(row[col.subKey])}</div> : null}
    </>
  );
}

export function ReportTable({
  columns,
  rows,
  footer,
  mutedKey,
  emptyMessage,
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
  footer?: ReportRow;
  /** Row key that, when true, greys the row out (e.g. voided). */
  mutedKey?: string;
  emptyMessage: string;
}) {
  const defs = useMemo<ColumnDef<typeof features, ReportRow>[]>(
    () =>
      columns.map((c) => ({
        id: c.key,
        header: c.header,
        accessorFn: (r: ReportRow) => sortValue(c, r),
        sortFn: c.kind === "number" || c.kind === "signed" || c.sortKey ? "basic" : "alphanumeric",
      })),
    [columns],
  );
  const table = useTable({ features, columns: defs, data: rows });

  if (rows.length === 0) return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;

  const numeric = (c: ReportColumn) => c.kind === "number" || c.kind === "signed";
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {table.getHeaderGroups()[0].headers.map((h, i) => {
              const col = columns[i];
              const sorted = h.column.getIsSorted();
              return (
                <TableHead key={h.id} className={cn(numeric(col) && "text-end")} aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}>
                  <button
                    type="button"
                    onClick={h.column.getToggleSortingHandler()}
                    className={cn("inline-flex min-h-9 items-center gap-1 font-medium", numeric(col) && "flex-row-reverse")}
                  >
                    {col.header}
                    {sorted === "asc" ? (
                      <ArrowUpIcon className="size-3.5" aria-hidden />
                    ) : sorted === "desc" ? (
                      <ArrowDownIcon className="size-3.5" aria-hidden />
                    ) : (
                      <ChevronsUpDownIcon className="size-3.5 opacity-40" aria-hidden />
                    )}
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className={cn(mutedKey && row.original[mutedKey] && "text-muted-foreground line-through decoration-muted-foreground/50")}>
              {columns.map((c) => (
                <TableCell key={c.key} className={cn("whitespace-nowrap", numeric(c) && "text-end tabular-nums", c.kind === "signed" && Number(row.original[c.key]) < 0 && "text-amber-700 dark:text-amber-400", c.kind === "signed" && Number(row.original[c.key]) > 0 && "text-emerald-700 dark:text-emerald-400")}>
                  {render(c, row.original)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        {footer && (
          <TableFooter>
            <TableRow>
              {columns.map((c) => (
                <TableCell key={c.key} className={cn("font-semibold", numeric(c) && "text-end tabular-nums")}>
                  {footer[c.key] === undefined ? "" : render(c, footer)}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
