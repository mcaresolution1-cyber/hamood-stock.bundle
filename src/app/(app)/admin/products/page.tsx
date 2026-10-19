import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { DownloadIcon, PlusIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/native-select";
import { Pagination } from "@/components/pagination";
import { ProductThumb } from "@/components/product-thumb";
import { ProductStatusBadge } from "@/components/product-status-badge";
import { Ltr } from "@/components/ltr";
import { MobileCard, ResponsiveList } from "@/components/mobile-list";
import { cn } from "@/lib/utils";
import { attributeLine, PRODUCT_STATUSES } from "@/lib/products";
import { categoryName, categoryNames } from "@/lib/categories";
import { categoryOptions } from "@/server/queries/categories";
import { requirePagePermission } from "@/server/auth/dal";
import { listProducts, parseProductFilters } from "@/server/queries/products";
import { ProductStatusMenu } from "./product-status-menu";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("products"))("title") };
}

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const user = await requirePagePermission("product:manage");
  const filters = parseProductFilters(await searchParams);
  const [t, tc, locale, result, categories, format] = await Promise.all([
    getTranslations("products"),
    getTranslations("common"),
    getLocale(),
    listProducts(user, filters),
    categoryOptions(filters.category ? [filters.category] : []),
    getFormatter(),
  ]);
  const filtered = Boolean(filters.q || filters.category || filters.status !== "current");
  const query = new URLSearchParams(
    Object.entries({ q: filters.q, category: filters.category, status: filters.status }).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
  const details = (p: (typeof result.rows)[number]) =>
    [categoryNames(p.categories, locale), attributeLine(p, t("kg"))].filter(Boolean).join(" · ");
  const money = (v: string | null | undefined) => (v ? format.number(Number(v), { minimumFractionDigits: 2, maximumFractionDigits: 2, numberingSystem: "latn" }) : "—");
  /** Stock figure: thousands separators; 0 is grey so real stock stands out. */
  const Qty = ({ value }: { value: number }) =>
    value === 0 ? <span className="text-muted-foreground/60">0</span> : <>{format.number(value, "qty")}</>;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/admin/products/export${query ? `?${query}` : ""}`}>
                <DownloadIcon className="size-4" aria-hidden />
                {t("export")}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin/products/import">
                <UploadIcon className="size-4" aria-hidden />
                {t("import")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/products/new">
                <PlusIcon className="size-4" aria-hidden />
                {t("new")}
              </Link>
            </Button>
          </>
        }
      />

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem_12rem_auto]">
        <Input name="q" defaultValue={filters.q} placeholder={t("searchPlaceholder")} aria-label={tc("search")} className="h-11 md:h-10" type="search" />
        <NativeSelect name="category" defaultValue={filters.category ?? ""} aria-label={t("category")}>
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryName(c, locale)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={filters.status} aria-label={tc("status")}>
          <option value="current">{t("statusCurrent")}</option>
          {PRODUCT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
          <option value="all">{t("statusAll")}</option>
        </NativeSelect>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="h-11 md:h-10 flex-1">
            {tc("search")}
          </Button>
          {filtered && (
            <Button variant="ghost" className="h-11 md:h-10" asChild>
              <Link href="/admin/products">{tc("clear")}</Link>
            </Button>
          )}
        </div>
      </form>

      <p className="mb-2 text-sm text-muted-foreground">{tc("results", { count: result.total })}</p>

      {result.rows.length === 0 ? (
        <EmptyState
          message={filtered ? t("empty") : t("emptyCatalogue")}
          action={
            !filtered && (
              <Button asChild>
                <Link href="/admin/products/new">{t("new")}</Link>
              </Button>
            )
          }
        />
      ) : (
        <ResponsiveList
          cards={result.rows.map((p) => (
            <MobileCard key={p.id} muted={p.status !== "ACTIVE"}>
              <Link href={`/products/${p.id}`} className="flex gap-3">
                {p.imageUrl && <ProductThumb src={p.imageUrl} className="size-14" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Ltr className="font-medium">{p.modelCode}</Ltr>
                    <ProductStatusBadge status={p.status} />
                  </div>
                  <p className="text-sm">{locale === "ar" ? p.nameAr : p.nameEn}</p>
                  <p className="truncate text-xs text-muted-foreground">{details(p)}</p>
                  <dl className="mt-1 flex flex-wrap gap-x-4 text-xs">
                    <div>
                      <dt className="inline text-muted-foreground">{t("sellable")}: </dt>
                      <dd className="inline font-medium tabular-nums">{format.number(p.sellable, "qty")}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">{t("damaged")}: </dt>
                      <dd className="inline tabular-nums">{format.number(p.damaged, "qty")}</dd>
                    </div>
                    {result.showCost && (
                      <div>
                        <dt className="inline text-muted-foreground">{t("value")}: </dt>
                        <dd className="inline tabular-nums">{money(p.value)}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </Link>
              <div className="mt-2 flex justify-end gap-1 border-t pt-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/admin/products/${p.id}/edit`}>{tc("edit")}</Link>
                </Button>
                <ProductStatusMenu id={p.id} modelCode={p.modelCode} status={p.status} />
              </div>
            </MobileCard>
          ))}
          table={
            // One scroll box (both directions) so the header row and the product column can stay put (sticky).
            <div className="max-h-[calc(100dvh-15rem)] min-h-64 overflow-auto">
              <table className="w-full caption-bottom border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-20 bg-background">
                  <tr className="[&>th]:h-10 [&>th]:border-b [&>th]:px-2 [&>th]:font-medium [&>th]:whitespace-nowrap">
                    <th className="sticky start-0 z-10 bg-background text-start">{t("product")}</th>
                    {result.warehouses.map((w) => (
                      <th key={w.id} className="text-end">
                        {w.name}
                      </th>
                    ))}
                    <th className="text-end">{t("sellable")}</th>
                    {result.hasDamaged && <th className="text-end">{t("damaged")}</th>}
                    <th className="text-end">{t("price")}</th>
                    {result.showCost && <th className="text-end">{t("value")}</th>}
                    <th className="text-end">
                      <span className="sr-only">{tc("actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((p) => {
                    const name = locale === "ar" ? p.nameAr : p.nameEn;
                    const second = [p.sku, name.trim().toUpperCase() === p.modelCode ? null : name, categoryNames(p.categories, locale)].filter(Boolean).join(" · ");
                    return (
                      <tr
                        key={p.id}
                        className={cn(
                          "group [&>td]:border-b [&>td]:px-2 [&>td]:py-1.5 [&>td]:align-middle hover:[&>td]:bg-muted",
                          p.status !== "ACTIVE" && "text-muted-foreground",
                        )}
                      >
                        <td className="sticky start-0 z-10 max-w-80 bg-background">
                          <div className="flex items-center gap-2">
                            {p.imageUrl && <ProductThumb src={p.imageUrl} className="size-8 shrink-0" />}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Link href={`/products/${p.id}`} title={name} className="truncate font-medium whitespace-nowrap underline-offset-4 hover:underline">
                                  <Ltr>{p.modelCode}</Ltr>
                                </Link>
                                {p.status !== "ACTIVE" && <ProductStatusBadge status={p.status} />}
                              </div>
                              <p className="truncate text-xs text-muted-foreground" title={second}>
                                <bdi>{second}</bdi>
                              </p>
                            </div>
                          </div>
                        </td>
                        {result.warehouses.map((w) => (
                          <td key={w.id} className="text-end tabular-nums">
                            <Qty value={p.qty[w.id] ?? 0} />
                          </td>
                        ))}
                        <td className="text-end font-semibold tabular-nums">
                          <Qty value={p.sellable} />
                        </td>
                        {result.hasDamaged && (
                          <td className="text-end tabular-nums">
                            <Qty value={p.damaged} />
                          </td>
                        )}
                        <td className="text-end whitespace-nowrap tabular-nums">{money(p.sellingPrice)}</td>
                        {result.showCost && <td className="text-end whitespace-nowrap tabular-nums">{money(p.value)}</td>}
                        <td>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/admin/products/${p.id}/edit`}>{tc("edit")}</Link>
                            </Button>
                            <ProductStatusMenu id={p.id} modelCode={p.modelCode} status={p.status} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          }
        />
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        basePath="/admin/products"
        searchParams={{ q: filters.q, category: filters.category, status: filters.status === "current" ? undefined : filters.status }}
      />
    </>
  );
}
