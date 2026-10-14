import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { MobileCard, ResponsiveList } from "@/components/mobile-list";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/server/auth/dal";
import { deleteCategory, setCategoryActive } from "@/server/actions/categories";
import { listCategories } from "@/server/queries/categories";
import { CategoryDialog } from "./category-dialog";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("categories"))("title") };
}

/** Product categories (plan ui-menu-import-categories, PU2): add, rename, reorder, hide, delete unused. */
export default async function CategoriesPage() {
  await requirePagePermission("product:manage");
  const [t, tc, categories] = await Promise.all([getTranslations("categories"), getTranslations("common"), listCategories()]);
  type Row = (typeof categories)[number];
  const nextPosition = Math.max(0, ...categories.map((c) => c.position)) + 1;

  const actions = (c: Row) => (
    <>
      <CategoryDialog category={{ id: c.id, nameEn: c.nameEn, nameAr: c.nameAr, position: String(c.position) }} />
      {!c.active && c.products === 0 && (
        <ConfirmAction label={tc("activate")} title={t("activateConfirm", { name: c.nameEn })} action={setCategoryActive.bind(null, c.id, true)} variant="ghost" />
      )}
      {c.products === 0 ? (
        <ConfirmAction
          label={tc("delete")}
          title={t("deleteConfirm", { name: c.nameEn })}
          action={deleteCategory.bind(null, c.id)}
          variant="ghost"
          destructive
        />
      ) : (
        <ConfirmAction
          label={c.active ? tc("deactivate") : tc("activate")}
          title={c.active ? t("deactivateConfirm", { name: c.nameEn }) : t("activateConfirm", { name: c.nameEn })}
          description={c.active ? t("deactivateHelp") : undefined}
          action={setCategoryActive.bind(null, c.id, !c.active)}
          variant="ghost"
          destructive={c.active}
        />
      )}
    </>
  );
  const productsLink = (c: Row) => (
    <Link href={`/admin/products?category=${c.id}&status=all`} className="underline-offset-4 hover:underline">
      {t("productCount", { count: c.products })}
    </Link>
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} actions={<CategoryDialog nextPosition={nextPosition} />} />
      {categories.length === 0 ? (
        <EmptyState message={t("empty")} />
      ) : (
        <ResponsiveList
          cards={categories.map((c) => (
            <MobileCard key={c.id} muted={!c.active}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    <bdi>{c.nameEn}</bdi>
                  </p>
                  <p lang="ar">
                    <bdi>{c.nameAr}</bdi>
                  </p>
                </div>
                {!c.active && <Badge variant="outline">{t("inactive")}</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{productsLink(c)}</p>
              <div className="mt-2 flex flex-wrap justify-end gap-1 border-t pt-2">{actions(c)}</div>
            </MobileCard>
          ))}
          table={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{t("position")}</TableHead>
                  <TableHead>{t("nameEn")}</TableHead>
                  <TableHead>{t("nameAr")}</TableHead>
                  <TableHead>{t("products")}</TableHead>
                  <TableHead className="text-end">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id} className={c.active ? "" : "text-muted-foreground"}>
                    <TableCell className="tabular-nums">{c.position}</TableCell>
                    <TableCell className="font-medium">
                      <bdi>{c.nameEn}</bdi>
                      {!c.active && (
                        <Badge variant="outline" className="ms-2">
                          {t("inactive")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell lang="ar">
                      <bdi>{c.nameAr}</bdi>
                    </TableCell>
                    <TableCell>{productsLink(c)}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">{actions(c)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        />
      )}
    </>
  );
}
