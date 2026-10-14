import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PencilIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/native-select";
import { ProductThumb } from "@/components/product-thumb";
import { Ltr } from "@/components/ltr";
import { ReportTable, type ReportColumn } from "@/components/reports/report-table";
import { attributeLine } from "@/lib/products";
import { categoryNames } from "@/lib/categories";
import { ProductStatusBadge } from "@/components/product-status-badge";
import { cn } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { getCurrentUser, requirePagePermission } from "@/server/auth/dal";
import { getProductStock, productModelCode, STOCK_CARD_LIMIT } from "@/server/queries/product-stock";

export async function generateMetadata({ params }: PageProps<"/products/[id]">): Promise<Metadata> {
  if (!(await getCurrentUser())) return { title: "—" };
  return { title: (await productModelCode((await params).id)) ?? "—" };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/products/[id]">) {
  const user = await requirePagePermission("stock:view");
  const { id } = await params;
  const wRaw = (await searchParams).warehouse;
  const warehouseId = typeof wRaw === "string" && wRaw ? wRaw : undefined;
  const data = await getProductStock(user, id, warehouseId);
  if (!data) notFound();
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);
  const { product } = data;

  const columns: ReportColumn[] = [
    { key: "date", header: t("entries.date"), sortKey: "at" },
    { key: "number", header: t("entries.number"), kind: "code", hrefKey: "href" },
    { key: "type", header: t("entries.type"), subKey: "reason" },
    { key: "warehouse", header: t("entries.warehouse") },
    { key: "change", header: t("productPage.change"), kind: "signed" },
    { key: "balance", header: t("productPage.balance"), kind: "number" },
  ];
  const rows = data.card.map((r) => ({
    date: format.dateTime(r.entryDate, { dateStyle: "short", timeStyle: "short" }),
    at: new Date(r.entryDate).getTime(),
    number: r.number,
    href: `/entries/${r.entryId}`,
    type: t(`entryTypes.${r.type}`),
    reason: t(`reasons.${r.reason}`),
    warehouse: r.warehouse,
    change: r.change,
    balance: r.balance,
    voided: r.voided,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <ProductThumb src={product.imageUrl} className="size-20" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            <Ltr>{product.modelCode}</Ltr>
          </h1>
          <p>{locale === "ar" ? product.nameAr : product.nameEn}</p>
          <p className="text-sm text-muted-foreground">
            {[categoryNames(product.categories, locale), attributeLine(product, t("products.kg"))]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("products.sku")}: <Ltr>{product.sku}</Ltr>
            {product.barcode && (
              <>
                {" · "}
                {t("products.barcode")}: <Ltr>{product.barcode}</Ltr>
              </>
            )}
            {product.defaultSupplier && (
              <>
                {" · "}
                {t("products.defaultSupplier")}: {locale === "ar" && product.defaultSupplier.nameAr ? product.defaultSupplier.nameAr : product.defaultSupplier.nameEn}
              </>
            )}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <ProductStatusBadge status={product.status} />
            {product.sellingPrice && <Badge variant="secondary">{t("productPage.price", { price: product.sellingPrice })}</Badge>}
            {data.lowStock && <Badge variant="destructive">{t("productPage.lowStock")}</Badge>}
            {"cost" in product && product.cost && (
              <Badge variant="secondary">{t("productPage.cost", { cost: String(product.cost) })}</Badge>
            )}
            {"averageCost" in product && product.averageCost && (
              <Badge variant="secondary">{t("productPage.averageCost", { cost: product.averageCost })}</Badge>
            )}
          </div>
        </div>
        {can(user.role, "product:manage") && (
          <Button variant="outline" asChild>
            <Link href={`/admin/products/${product.id}/edit`}>
              <PencilIcon className="size-4" aria-hidden />
              {t("productPage.edit")}
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-3xl font-bold tabular-nums">{data.sellable}</p>
          <p className="text-sm text-muted-foreground">{t("productPage.sellable")}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-3xl font-bold tabular-nums">{data.total}</p>
          <p className="text-sm text-muted-foreground">{t("productPage.total")}</p>
        </div>
        {product.lowStockLevel > 0 && (
          <div className="col-span-2 rounded-lg border p-4 sm:col-span-1">
            <p className="text-3xl font-bold tabular-nums">{product.lowStockLevel}</p>
            <p className="text-sm text-muted-foreground">{t("products.lowStockLevel")}</p>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("productPage.perWarehouse")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {data.perWarehouse.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {w.name}
                  {product.reorder.some((r) => r.warehouseId === w.id && r.reorderLevel > 0) && (
                    <span className="ms-2 text-xs text-muted-foreground">
                      {t("productPage.reorderAt", { level: product.reorder.find((r) => r.warehouseId === w.id)!.reorderLevel })}
                    </span>
                  )}
                  {w.kind === "DAMAGED" && (
                    <Badge variant="destructive" className="ms-2">
                      {t("warehouseKinds.DAMAGED")}
                    </Badge>
                  )}
                </span>
                <span className="text-lg font-semibold tabular-nums">{w.quantity}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {"costHistory" in product && product.costHistory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("products.costHistory")}</CardTitle>
          </CardHeader>
          <CardContent>
            {product.costHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("products.noCostHistory")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {product.costHistory.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-muted-foreground">
                      {format.dateTime(c.at, { dateStyle: "medium", timeStyle: "short" })} · {c.changedBy.name} ·{" "}
                      {t.has(`products.costSource.${c.source}` as "products.costSource.MANUAL") ? t(`products.costSource.${c.source}` as "products.costSource.MANUAL") : c.source}
                    </span>
                    <Ltr className="font-medium tabular-nums">{c.cost ?? "—"}</Ltr>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">{t("productPage.card")}</h2>
            <p className="text-sm text-muted-foreground">{t("productPage.cardHint")}</p>
          </div>
          <form method="get" className="flex gap-2">
            <NativeSelect name="warehouse" defaultValue={warehouseId ?? ""} aria-label={t("entries.warehouse")} className="w-48">
              <option value="">{t("productPage.allWarehouses")}</option>
              {data.perWarehouse.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="secondary" className="h-11 md:h-10">
              {t("reports.apply")}
            </Button>
          </form>
        </div>
        {/* Phones: a compact list; larger screens: the sortable table. */}
        <ul className="divide-y rounded-lg border md:hidden">
          {rows.length === 0 && <li className="p-4 text-sm text-muted-foreground">{t("productPage.empty")}</li>}
          {rows.map((r, i) => (
            <li key={`${r.href}-${i}`} className={cn("flex items-center justify-between gap-3 p-3", r.voided && "text-muted-foreground line-through")}>
              <Link href={r.href} className="flex min-h-11 min-w-0 flex-col justify-center">
                <Ltr className="block font-medium">{r.number}</Ltr>
                <span className="block truncate text-xs text-muted-foreground">
                  {r.date} · {r.reason} · {r.warehouse}
                </span>
              </Link>
              <div className="shrink-0 text-end" dir="ltr">
                <span className={cn("block font-semibold tabular-nums", r.change < 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400")}>
                  {r.change > 0 ? `+${r.change}` : r.change}
                </span>
                <span className="block text-xs text-muted-foreground tabular-nums">= {r.balance}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
          <ReportTable columns={columns} rows={rows} mutedKey="voided" emptyMessage={t("productPage.empty")} />
        </div>
        {rows.length >= STOCK_CARD_LIMIT && (
          <p className="text-sm text-muted-foreground">{t("productPage.showingLatest", { count: STOCK_CARD_LIMIT })}</p>
        )}
      </section>
    </div>
  );
}
