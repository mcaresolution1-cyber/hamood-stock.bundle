import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArrowLeftIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntryTypeBadge } from "@/components/entry-badges";
import { ProductThumb } from "@/components/product-thumb";
import { Ltr } from "@/components/ltr";
import { can } from "@/lib/permissions";
import { getCurrentUser, requirePagePermission } from "@/server/auth/dal";
import { getEntry, relatedEntries } from "@/server/queries/entries";
import { VoidDialog } from "./void-dialog";

export async function generateMetadata({ params }: PageProps<"/entries/[id]">): Promise<Metadata> {
  if (!(await getCurrentUser())) return { title: "—" }; // no DB read before the access check
  const e = await getEntry((await params).id);
  return { title: e?.number ?? "—" };
}

export default async function EntryPage({ params }: PageProps<"/entries/[id]">) {
  const user = await requirePagePermission("stock:view");
  const entry = await getEntry((await params).id);
  if (!entry) notFound();
  const [t, tc, format, locale] = await Promise.all([getTranslations(), getTranslations("common"), getFormatter(), getLocale()]);
  const rel = relatedEntries(entry);
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  const units = entry.lines.reduce((s, l) => s + l.quantity, 0);
  const printable = (entry.type === "OUT" || entry.type === "TRANSFER_OUT") && !entry.voidedAt;
  const canVoid = can(user.role, "entry:void") && entry.type !== "VOID" && !entry.voidedAt;

  const details: [string, React.ReactNode][] = [
    [t("entries.reason"), t(`reasons.${entry.reason}`)],
    [t("entries.warehouse"), entry.warehouse.name],
    [t("entries.date"), when(entry.entryDate)],
  ];
  if (rel.transferIn) details.push([t("entryForm.toWarehouse"), rel.transferIn.warehouse.name]);
  if (rel.transferOut) details.push([t("entryForm.fromWarehouse"), rel.transferOut.warehouse.name]);
  if (entry.supplierName) details.push([t("entries.supplier"), entry.supplierName]);
  if (entry.reference) details.push([t("entries.reference"), <Ltr key="r">{entry.reference}</Ltr>]);
  if (entry.customerName) details.push([t("entries.customer"), <bdi key="c">{entry.customerName}</bdi>]);
  if (entry.customerPhone) details.push([t("entries.phone"), <Ltr key="p">{entry.customerPhone}</Ltr>]);
  if (entry.technicianName) details.push([t("entries.technician"), entry.technicianName]);
  if (entry.note && entry.type !== "VOID") details.push([t("entries.note"), entry.note]);
  if (entry.type === "VOID" && entry.note) details.push([t("void.reason"), entry.note]);

  const linkTo = (e: { id: string; number: string }) => (
    <Link href={`/entries/${e.id}`} className="font-medium underline underline-offset-4">
      <Ltr>{e.number}</Ltr>
    </Link>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ms-2">
        <Link href="/entries">
          <ArrowLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
          {t("entries.backToList")}
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <Ltr>{entry.number}</Ltr>
          </h1>
          <div className="mt-1">
            <EntryTypeBadge type={entry.type} voided={Boolean(entry.voidedAt)} />
          </div>
        </div>
        <div className="flex gap-2">
          {printable && (
            <Button variant="outline" asChild>
              <Link href={`/print/entries/${entry.id}`} target="_blank">
                <PrinterIcon className="size-4" aria-hidden />
                {t("entryForm.printNote")}
              </Link>
            </Button>
          )}
          {canVoid && (
            <VoidDialog
              entryId={entry.id}
              number={entry.number}
              isTransfer={entry.type === "TRANSFER_OUT" || entry.type === "TRANSFER_IN"}
            />
          )}
        </div>
      </div>

      {/* Audit trail: who did what, when */}
      <Card>
        <CardContent className="space-y-1 pt-6 text-sm">
          <p>{t("entries.created", { name: entry.createdBy.name, date: when(entry.createdAt) })}</p>
          {entry.voidedAt && (
            <p className="text-destructive">
              {t("entries.voidedBy", { name: entry.voidedBy?.name ?? "—", date: when(entry.voidedAt) })}
              {rel.voidEntry?.note && <> · {t("entries.voidReason", { reason: rel.voidEntry.note })}</>}
            </p>
          )}
          {rel.voidEntry && (
            <p>
              {t("entries.voidedIn")}: {linkTo(rel.voidEntry)}
            </p>
          )}
          {rel.reverses && (
            <p>
              {t("entries.reverses")}: {linkTo(rel.reverses)}
            </p>
          )}
          {(rel.transferIn || rel.transferOut) && (
            <p>
              {t("entries.transferPair")}: {linkTo((rel.transferIn ?? rel.transferOut)!)}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {details.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {entry.photoUrl && (
            <a href={entry.photoUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-protected route */}
              <img src={entry.photoUrl} alt={t("entries.photo")} className="h-40 rounded-md border object-cover" />
            </a>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("entries.lines")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {entry.lines.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-3">
                <ProductThumb src={l.product.imageUrl} />
                <div className="min-w-0 flex-1">
                  <Ltr className="block font-medium">{l.product.modelCode}</Ltr>
                  <span className="block truncate text-sm text-muted-foreground">
                    {locale === "ar" ? l.product.nameAr : l.product.nameEn}
                    {l.product.variant ? ` · ${l.product.variant}` : ""}
                  </span>
                </div>
                <span className="text-lg font-semibold tabular-nums">× {l.quantity}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t pt-2 text-end text-sm font-medium">
            {t("entries.total")}: {tc("units", { count: units })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
