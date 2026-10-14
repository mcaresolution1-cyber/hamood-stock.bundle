import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DownloadIcon, PlusIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/native-select";
import { Pagination } from "@/components/pagination";
import { ProductThumb } from "@/components/product-thumb";
import { ProductStatusBadge } from "@/components/product-status-badge";
import { Ltr } from "@/components/ltr";
import { MobileCard, ResponsiveList } from "@/components/mobile-list";
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
  const [t, tc, locale, result, categories] = await Promise.all([
    getTranslations("products"),
    getTranslations("common"),
    getLocale(),
    listProducts(user, filters),
    categoryOptions(filters.category ? [filters.category] : []),
  ]);
  const filtered = Boolean(filters.q || filters.category || filters.status !== "current");
  const query = new URLSearchParams(
    Object.entries({ q: filters.q, category: filters.category, status: filters.status }).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
  const details = (p: (typeof result.rows)[number]) =>
    [categoryNames(p.categories, locale), attributeLine(p, t("kg"))].filter(Boolean).join(" · ");
  const sar = (v: string | null | undefined) => (v ? v : "—");

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
                <ProductThumb src={p.imageUrl} className="size-14" />
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
                      <dd className="inline font-medium tabular-nums">{p.sellable}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">{t("damaged")}: </dt>
                      <dd className="inline tabular-nums">{p.damaged}</dd>
                    </div>
                    {result.showCost && (
                      <div>
                        <dt className="inline text-muted-foreground">{t("value")}: </dt>
                        <dd className="inline tabular-nums">{sar(p.value)}</dd>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14" />
                    <TableHead>{t("modelCode")}</TableHead>
                    {result.warehouses.map((w) => (
                      <TableHead key={w.id} className="text-end">
                        {w.name}
                      </TableHead>
                    ))}
                    <TableHead className="text-end">{t("sellable")}</TableHead>
                    <TableHead className="text-end">{t("damaged")}</TableHead>
                    <TableHead className="text-end">{t("price")}</TableHead>
                    {result.showCost && <TableHead className="text-end">{t("value")}</TableHead>}
                    <TableHead className="text-end">{tc("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((p) => (
                    <TableRow key={p.id} className={p.status === "ACTIVE" ? "" : "text-muted-foreground"}>
                      <TableCell>
                        <ProductThumb src={p.imageUrl} />
                      </TableCell>
                      <TableCell className="min-w-56 whitespace-normal">
                        <Link href={`/products/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                          <Ltr>{p.modelCode}</Ltr>
                        </Link>
                        {p.sku !== p.modelCode && <Ltr className="ms-2 text-xs text-muted-foreground">{p.sku}</Ltr>}
                        <div className="text-sm">{locale === "ar" ? p.nameAr : p.nameEn}</div>
                        <div className="text-xs text-muted-foreground">{details(p)}</div>
                        <ProductStatusBadge status={p.status} />
                      </TableCell>
                      {result.warehouses.map((w) => (
                        <TableCell key={w.id} className="text-end tabular-nums">
                          {p.qty[w.id] ?? 0}
                        </TableCell>
                      ))}
                      <TableCell className="text-end font-medium tabular-nums">{p.sellable}</TableCell>
                      <TableCell className="text-end tabular-nums">{p.damaged}</TableCell>
                      <TableCell className="text-end tabular-nums">{sar(p.sellingPrice)}</TableCell>
                      {result.showCost && <TableCell className="text-end tabular-nums">{sar(p.value)}</TableCell>}
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/admin/products/${p.id}/edit`}>{tc("edit")}</Link>
                          </Button>
                          <ProductStatusMenu id={p.id} modelCode={p.modelCode} status={p.status} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
