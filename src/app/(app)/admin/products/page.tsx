import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PlusIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/native-select";
import { Pagination } from "@/components/pagination";
import { ProductThumb } from "@/components/product-thumb";
import { Ltr } from "@/components/ltr";
import { MobileCard, ResponsiveList } from "@/components/mobile-list";
import { CATEGORIES, isCategory } from "@/lib/products";
import { requirePagePermission } from "@/server/auth/dal";
import { listProducts } from "@/server/queries/products";
import { ProductActiveToggle } from "./product-active-toggle";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("products"))("title") };
}

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const user = await requirePagePermission("product:manage");
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const filters = {
    q: one(sp.q) ?? "",
    category: isCategory(one(sp.category) ?? "") ? one(sp.category) : undefined,
    status: (["active", "inactive", "all"] as const).find((s) => s === one(sp.status)) ?? "active",
    page: Number(one(sp.page)) || 1,
  };
  const [t, tc, tcat, locale] = await Promise.all([
    getTranslations("products"),
    getTranslations("common"),
    getTranslations("categories"),
    getLocale(),
  ]);
  const result = await listProducts(user, filters);
  const filtered = Boolean(filters.q || filters.category || filters.status !== "active");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
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

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem_9rem_auto]">
        <Input
          name="q"
          defaultValue={filters.q}
          placeholder={t("searchPlaceholder")}
          aria-label={tc("search")}
          className="h-11 md:h-10"
          type="search"
        />
        <NativeSelect name="category" defaultValue={filters.category ?? ""} aria-label={t("category")}>
          <option value="">{t("allCategories")}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {tcat(c)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={filters.status} aria-label={tc("status")}>
          <option value="active">{t("statusActive")}</option>
          <option value="inactive">{t("statusInactive")}</option>
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
            <MobileCard key={p.id} muted={!p.active}>
              <div className="flex gap-3">
                <ProductThumb src={p.imageUrl} className="size-12" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Ltr className="font-medium">{p.modelCode}</Ltr>
                    {!p.active && <Badge variant="outline">{tc("inactive")}</Badge>}
                  </div>
                  <p className="text-sm">{locale === "ar" ? p.nameAr : p.nameEn}</p>
                  <p className="text-xs text-muted-foreground">
                    {[isCategory(p.category) ? tcat(p.category) : p.category, p.variant].filter(Boolean).join(" · ")}
                  </p>
                  <dl className="mt-1 flex gap-4 text-xs">
                    <div>
                      <dt className="inline text-muted-foreground">{t("cost")}: </dt>
                      <dd className="inline tabular-nums">{"cost" in p && p.cost ? p.cost : "—"}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">{t("lowStockLevel")}: </dt>
                      <dd className="inline tabular-nums">{p.lowStockLevel}</dd>
                    </div>
                  </dl>
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-1 border-t pt-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/admin/products/${p.id}/edit`}>{tc("edit")}</Link>
                </Button>
                <ProductActiveToggle id={p.id} modelCode={p.modelCode} active={p.active} />
              </div>
            </MobileCard>
          ))}
          table={
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14" />
                    <TableHead>{t("modelCode")}</TableHead>
                    <TableHead>{t("category")}</TableHead>
                    <TableHead className="text-end">{t("cost")}</TableHead>
                    <TableHead className="text-end">{t("lowStockLevel")}</TableHead>
                    <TableHead className="text-end">{tc("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((p) => (
                    <TableRow key={p.id} className={p.active ? "" : "text-muted-foreground"}>
                      <TableCell>
                        <ProductThumb src={p.imageUrl} />
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <Ltr className="font-medium">{p.modelCode}</Ltr>
                        <div className="text-sm">{locale === "ar" ? p.nameAr : p.nameEn}</div>
                        {p.variant && <div className="text-xs text-muted-foreground">{p.variant}</div>}
                        {!p.active && <Badge variant="outline">{tc("inactive")}</Badge>}
                      </TableCell>
                      <TableCell>{isCategory(p.category) ? tcat(p.category) : p.category}</TableCell>
                      <TableCell className="text-end tabular-nums">{"cost" in p && p.cost ? p.cost : "—"}</TableCell>
                      <TableCell className="text-end tabular-nums">{p.lowStockLevel}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/admin/products/${p.id}/edit`}>{tc("edit")}</Link>
                          </Button>
                          <ProductActiveToggle id={p.id} modelCode={p.modelCode} active={p.active} />
                        </div>
                      </TableCell>
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
        basePath="/admin/products"
        searchParams={{ q: filters.q, category: filters.category, status: filters.status }}
      />
    </>
  );
}
