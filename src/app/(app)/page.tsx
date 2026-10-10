import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowDownToLineIcon, ArrowUpFromLineIcon, ChevronRightIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeniedToast } from "@/components/denied-toast";
import { ProductSearch } from "@/components/product-search";
import { EntryTypeBadge } from "@/components/entry-badges";
import { Ltr } from "@/components/ltr";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/dal";
import { dashboardStats, productSearchList } from "@/server/queries/dashboard";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard"))("title") };
}

export default async function DashboardPage() {
  // Pages re-check the user themselves: layouts are not re-rendered on every navigation.
  const user = await requireUser();
  const [t, format, stats, products] = await Promise.all([
    getTranslations(),
    getFormatter(),
    dashboardStats(),
    productSearchList(),
  ]);
  const canWrite = can(user.role, "entry:create");

  const cards = [
    { label: t("dashboard.products"), value: stats.activeProducts, href: "/reports/stock-on-hand" },
    { label: t("dashboard.lowStock"), value: stats.lowStockCount, href: "/reports/low-stock", alert: stats.lowStockCount > 0 },
    { label: t("dashboard.today"), value: stats.todayEntries, href: "/entries" },
  ];

  return (
    <div className="space-y-6">
      <Suspense>
        <DeniedToast />
      </Suspense>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground">{t("dashboard.welcome", { name: user.name })}</p>
      </div>

      {canWrite && (
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/stock/in"
            className="flex min-h-28 flex-col justify-between rounded-xl bg-emerald-600 p-4 text-white shadow-sm transition-colors hover:bg-emerald-700 active:bg-emerald-800"
          >
            <ArrowDownToLineIcon className="size-7" aria-hidden />
            <span>
              <span className="block text-xl font-semibold">{t("dashboard.stockIn")}</span>
              <span className="block text-sm text-white/85">{t("dashboard.stockInHint")}</span>
            </span>
          </Link>
          <Link
            href="/stock/out"
            className="flex min-h-28 flex-col justify-between rounded-xl bg-amber-500 p-4 text-zinc-950 shadow-sm transition-colors hover:bg-amber-600 active:bg-amber-700"
          >
            <ArrowUpFromLineIcon className="size-7" aria-hidden />
            <span>
              <span className="block text-xl font-semibold">{t("dashboard.stockOut")}</span>
              <span className="block text-sm text-zinc-950/75">{t("dashboard.stockOutHint")}</span>
            </span>
          </Link>
        </div>
      )}

      <section aria-labelledby="search-title" className="space-y-2">
        <h2 id="search-title" className="text-sm font-medium">
          {t("dashboard.searchTitle")}
        </h2>
        <ProductSearch products={products} />
      </section>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="rounded-lg border p-3 transition-colors hover:bg-accent sm:p-4">
            <p className={cn("text-2xl font-bold tabular-nums sm:text-3xl", c.alert && "text-destructive")}>{c.value}</p>
            <p className="text-xs text-muted-foreground sm:text-sm">{c.label}</p>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{t("dashboard.recent")}</CardTitle>
          <Link href="/entries" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            {t("dashboard.viewAll")}
            <ChevronRightIcon className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        </CardHeader>
        <CardContent>
          {stats.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("dashboard.noEntries")}</p>
          ) : (
            <ul className="divide-y">
              {stats.recent.map((e) => (
                <li key={e.id}>
                  <Link href={`/entries/${e.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-accent/50">
                    <div className="min-w-0">
                      <Ltr className="font-medium">{e.number}</Ltr>
                      <p className="truncate text-sm text-muted-foreground">
                        {t(`reasons.${e.reason}`)} · {e.warehouse.name} · {format.relativeTime(e.entryDate)}
                      </p>
                    </div>
                    <EntryTypeBadge type={e.type} voided={Boolean(e.voidedAt)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
