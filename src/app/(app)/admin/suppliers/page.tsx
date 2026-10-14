import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { Ltr } from "@/components/ltr";
import { MobileCard, ResponsiveList } from "@/components/mobile-list";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/server/auth/dal";
import { setSupplierActive } from "@/server/actions/suppliers";
import { listSuppliers, type SupplierRow } from "@/server/queries/suppliers";
import { SupplierDialog } from "./supplier-dialog";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("suppliers"))("title") };
}

const text = (v: string | null) => v ?? "";

export default async function SuppliersPage({ searchParams }: PageProps<"/admin/suppliers">) {
  await requirePagePermission("supplier:manage");
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").slice(0, 100);
  const showInactive = sp.inactive === "1";
  const [t, tc, suppliers] = await Promise.all([getTranslations("suppliers"), getTranslations("common"), listSuppliers({ q, showInactive })]);

  const actions = (s: SupplierRow) => (
    <>
      <SupplierDialog
        supplier={{
          id: s.id,
          nameEn: s.nameEn,
          nameAr: text(s.nameAr),
          contactPerson: text(s.contactPerson),
          phone: text(s.phone),
          email: text(s.email),
          city: text(s.city),
          country: text(s.country),
          vatNumber: text(s.vatNumber),
          paymentTerms: text(s.paymentTerms),
          notes: text(s.notes),
        }}
      />
      <ConfirmAction
        label={s.active ? tc("deactivate") : tc("activate")}
        title={s.active ? t("deactivateConfirm", { name: s.nameEn }) : t("activateConfirm", { name: s.nameEn })}
        action={setSupplierActive.bind(null, s.id, !s.active)}
        variant="ghost"
        destructive={s.active}
      />
    </>
  );
  const contact = (s: SupplierRow) => [s.contactPerson, s.phone].filter(Boolean);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} actions={<SupplierDialog />} />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={q} placeholder={t("search")} aria-label={tc("search")} type="search" className="h-11 max-w-sm md:h-10" />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="inactive" value="1" defaultChecked={showInactive} className="size-4 accent-primary" />
          {t("showInactive")}
        </label>
        <Button type="submit" variant="secondary" className="h-11 md:h-10">
          {tc("search")}
        </Button>
        {(q || showInactive) && (
          <Button variant="ghost" className="h-11 md:h-10" asChild>
            <Link href="/admin/suppliers">{tc("clear")}</Link>
          </Button>
        )}
      </form>

      {suppliers.length === 0 ? (
        <EmptyState message={t("empty")} />
      ) : (
        <ResponsiveList
          cards={suppliers.map((s) => (
            <MobileCard key={s.id} muted={!s.active}>
              <p className="font-medium">
                <bdi>{s.nameEn}</bdi>
                {s.nameAr && <span className="text-muted-foreground"> · {s.nameAr}</span>}
              </p>
              <p className="text-sm text-muted-foreground">
                {contact(s).map((c, i) => (
                  <span key={i}>
                    {i > 0 && " · "}
                    <bdi>{c}</bdi>
                  </span>
                ))}
              </p>
              {s.vatNumber && (
                <p className="text-xs text-muted-foreground">
                  {t("vatNumber")}: <Ltr>{s.vatNumber}</Ltr>
                </p>
              )}
              <div className="mt-2 flex flex-wrap justify-end gap-1 border-t pt-2">{actions(s)}</div>
            </MobileCard>
          ))}
          table={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("nameEn")}</TableHead>
                  <TableHead>{t("contactPerson")}</TableHead>
                  <TableHead>{t("city")}</TableHead>
                  <TableHead>{t("vatNumber")}</TableHead>
                  <TableHead>{t("paymentTerms")}</TableHead>
                  <TableHead className="text-end">{t("deliveries")}</TableHead>
                  <TableHead className="text-end">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.id} className={s.active ? "" : "text-muted-foreground"}>
                    <TableCell className="whitespace-normal">
                      <div className="font-medium">
                        <bdi>{s.nameEn}</bdi>
                      </div>
                      {s.nameAr && <div className="text-sm text-muted-foreground">{s.nameAr}</div>}
                      {!s.active && <div className="text-xs">{tc("inactive")}</div>}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {s.contactPerson && <div>{s.contactPerson}</div>}
                      {s.phone && <Ltr className="text-sm text-muted-foreground">{s.phone}</Ltr>}
                      {s.email && <Ltr className="block text-xs text-muted-foreground">{s.email}</Ltr>}
                    </TableCell>
                    <TableCell>{[s.city, s.country].filter(Boolean).join(", ")}</TableCell>
                    <TableCell>
                      <Ltr>{text(s.vatNumber)}</Ltr>
                    </TableCell>
                    <TableCell className="max-w-48 whitespace-normal">{text(s.paymentTerms)}</TableCell>
                    <TableCell className="text-end tabular-nums">{s._count.entries}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">{actions(s)}</div>
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
