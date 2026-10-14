import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Ltr } from "@/components/ltr";
import { MobileCard, ResponsiveList } from "@/components/mobile-list";
import { RequestStatusBadge } from "@/components/request-badge";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/dal";
import { canUseApprovals, listRequests, parseView, requestCounts, REQUEST_VIEWS } from "@/server/queries/approvals";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("approvals"))("title") };
}

export default async function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  const user = await requireUser();
  if (!canUseApprovals(user)) redirect("/?denied=1");
  const sp = await searchParams;
  const view = parseView(user, sp.view);
  const [t, tc, format, result, counts] = await Promise.all([
    getTranslations("approvals"),
    getTranslations("common"),
    getFormatter(),
    listRequests(user, view, sp.page),
    requestCounts(user),
  ]);
  const views = can(user.role, "approval:decide") ? REQUEST_VIEWS : (["mine"] as const);
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  const warehouses = (r: (typeof result.rows)[number]) =>
    r.otherWarehouse ? `${r.warehouse.name} → ${r.otherWarehouse.name}` : r.warehouse.name;
  const badgeCount = { toDecide: counts.toDecide, mine: counts.minePending, decided: 0 } as const;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      {views.length > 1 && (
        <nav aria-label={t("title")} className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {views.map((v) => (
            <Link
              key={v}
              href={`/approvals?view=${v}`}
              aria-current={v === view ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium",
                v === view ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`views.${v}`)}
              {badgeCount[v] > 0 && (
                <span className="rounded-full bg-amber-500 px-2 text-xs font-semibold text-white tabular-nums">{badgeCount[v]}</span>
              )}
            </Link>
          ))}
        </nav>
      )}

      {result.rows.length === 0 ? (
        <EmptyState message={t(`empty.${view}`)} />
      ) : (
        <ResponsiveList
          cards={result.rows.map((r) => (
            <MobileCard key={r.id} muted={r.status === "CANCELLED"}>
              <Link href={`/approvals/${r.id}`} className="block">
                <div className="flex items-start justify-between gap-2">
                  <Ltr className="font-semibold">{r.number}</Ltr>
                  <RequestStatusBadge status={r.status} />
                </div>
                <p className="mt-1 text-sm">
                  {t(`rules.${r.rule as "correction"}`)} · {warehouses(r)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {when(r.requestedAt)} · {r.requestedBy.name}
                </p>
                <p className="mt-1 text-end text-sm tabular-nums">
                  {t("units")}: {r.units}
                </p>
              </Link>
            </MobileCard>
          ))}
          table={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("number")}</TableHead>
                  <TableHead>{t("what")}</TableHead>
                  <TableHead>{t("warehouse")}</TableHead>
                  <TableHead>{t("requestedBy")}</TableHead>
                  <TableHead>{t("requestedAt")}</TableHead>
                  <TableHead>{tc("status")}</TableHead>
                  <TableHead className="text-end">{t("units")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => (
                  <TableRow key={r.id} className={r.status === "CANCELLED" ? "text-muted-foreground" : ""}>
                    <TableCell className="font-medium">
                      <Link href={`/approvals/${r.id}`} className="underline-offset-4 hover:underline">
                        <Ltr>{r.number}</Ltr>
                      </Link>
                    </TableCell>
                    <TableCell>{t(`rules.${r.rule as "correction"}`)}</TableCell>
                    <TableCell>{warehouses(r)}</TableCell>
                    <TableCell>{r.requestedBy.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{when(r.requestedAt)}</TableCell>
                    <TableCell>
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <RequestStatusBadge status={r.status} />
                        {view === "decided" && r.decidedBy && <span className="text-sm">{r.decidedBy.name}</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{r.units}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        />
      )}
      <Pagination page={result.page} pageCount={result.pageCount} basePath="/approvals" searchParams={{ view }} />
    </>
  );
}
