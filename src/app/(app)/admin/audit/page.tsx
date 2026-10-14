import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { FilterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { requirePagePermission } from "@/server/auth/dal";
import { AUDIT_AREAS, listAudit, parseAuditFilters } from "@/server/queries/audit";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("audit"))("title") };
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requirePagePermission("audit:view");
  const filters = parseAuditFilters(await searchParams);
  const [t, tc, format, result] = await Promise.all([getTranslations(), getTranslations("common"), getFormatter(), listAudit(filters)]);
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });

  // Message keys are built from stored values; anything unknown is shown as stored.
  const has = (k: string) => t.has(k as Parameters<typeof t.has>[0]);
  const tr = (k: string) => t(k as Parameters<typeof t>[0]);
  const label = (field: string) => (has(`audit.fields.${field}`) ? tr(`audit.fields.${field}`) : field);
  /** A stored value as readable text: roles/kinds/categories translated, booleans yes/no, objects as "field: value". */
  const show = (field: string, v: Json | undefined): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? tc("yes") : tc("no");
    if (Array.isArray(v)) return v.length ? v.map((x) => show(field, x)).join(", ") : "—";
    if (typeof v === "object") return Object.entries(v).map(([k, x]) => `${label(k)}: ${show(k, x)}`).join(" · ");
    const s = String(v);
    const ns = { role: "roles", kind: "warehouseKinds", category: "categories", status: "approvals.status" }[field];
    if (ns && /^[\w-]+$/.test(s) && has(`${ns}.${s}`)) return tr(`${ns}.${s}`);
    if (field === "status" && /^\w+$/.test(s) && has(`products.statuses.${s}`)) return tr(`products.statuses.${s}`);
    return s;
  };
  const changes = (before: Json, after: Json) => {
    const b = (before && typeof before === "object" && !Array.isArray(before) ? before : {}) as Record<string, Json>;
    const a = (after && typeof after === "object" && !Array.isArray(after) ? after : {}) as Record<string, Json>;
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.map((k) => ({ field: k, before: k in b ? show(k, b[k]) : null, after: k in a ? show(k, a[k]) : null }));
  };
  const actionLabel = (a: string) => {
    const key = `audit.actions.${a.replace(".", "_")}`; // "product.update" → audit.actions.product_update
    return has(key) ? tr(key) : a;
  };
  const subjectHref = (type: string, id: string | null) =>
    !id ? null : type === "product" ? `/products/${id}` : type === "entry" ? `/entries/${id}` : type === "approval" ? `/approvals/${id}` : type === "user" ? `/admin/users/${id}` : null;
  const activeFilters = [filters.area, filters.userId, filters.from, filters.to].filter(Boolean).length;

  return (
    <>
      <PageHeader title={t("audit.title")} description={t("audit.subtitle")} />

      <details className="mb-4 rounded-lg border" open={activeFilters > 0}>
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium">
          <FilterIcon className="size-4" aria-hidden />
          {t("entries.filter")}
          {activeFilters > 0 && <span className="rounded bg-primary px-1.5 text-xs text-primary-foreground">{activeFilters}</span>}
        </summary>
        <form method="get" className="grid gap-3 border-t p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm">
            {t("audit.area")}
            <NativeSelect name="area" defaultValue={filters.area ?? ""}>
              <option value="">{t("audit.allAreas")}</option>
              {AUDIT_AREAS.map((a) => (
                <option key={a} value={a}>
                  {t(`audit.areas.${a}`)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            {t("audit.user")}
            <NativeSelect name="userId" defaultValue={filters.userId ?? ""}>
              <option value="">{t("audit.allUsers")}</option>
              {result.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            {t("entries.from")}
            <Input type="date" name="from" defaultValue={filters.from ?? ""} className="h-11 md:h-10" />
          </label>
          <label className="grid gap-1 text-sm">
            {t("entries.to")}
            <Input type="date" name="to" defaultValue={filters.to ?? ""} className="h-11 md:h-10" />
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit">{tc("filter")}</Button>
            <Button variant="ghost" asChild>
              <Link href="/admin/audit">{tc("clear")}</Link>
            </Button>
          </div>
        </form>
      </details>

      <p className="mb-2 text-sm text-muted-foreground">{tc("results", { count: result.total })}</p>

      {result.rows.length === 0 ? (
        <EmptyState message={t("audit.empty")} />
      ) : (
        <ol className="divide-y rounded-lg border">
          {result.rows.map((r) => {
            const href = subjectHref(r.subjectType, r.subjectId);
            const list = changes(r.before as Json, r.after as Json);
            return (
              <li key={r.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-medium">
                    {actionLabel(r.action)}
                    {r.subjectLabel && (
                      <>
                        {" · "}
                        {href ? (
                          <Link href={href} className="underline underline-offset-4">
                            <bdi>{r.subjectLabel}</bdi>
                          </Link>
                        ) : (
                          <bdi>{r.subjectLabel}</bdi>
                        )}
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {when(r.at)} · {r.actor.name}
                  </p>
                </div>
                {list.length > 0 && (
                  <ul className="space-y-0.5 text-muted-foreground">
                    {list.map((c) => (
                      <li key={c.field} className="break-words">
                        <span className="text-foreground">{label(c.field)}:</span>{" "}
                        {c.before !== null && c.after !== null ? (
                          <>
                            <del className="decoration-muted-foreground/60">
                              <bdi>{c.before}</bdi>
                            </del>{" "}
                            <span aria-hidden className="rtl:hidden">→</span>
                            <span aria-hidden className="ltr:hidden">←</span>{" "}
                            <bdi className="text-foreground">{c.after}</bdi>
                          </>
                        ) : (
                          <bdi className="text-foreground">{c.after ?? c.before}</bdi>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        basePath="/admin/audit"
        searchParams={{ area: filters.area, userId: filters.userId, from: filters.from, to: filters.to }}
      />
    </>
  );
}
