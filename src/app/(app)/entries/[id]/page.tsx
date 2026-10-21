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
import { can, canWriteToWarehouse } from "@/lib/permissions";
import { getCurrentUser, requirePagePermission } from "@/server/auth/dal";
import { getEntry, getEntryMoney, relatedEntries } from "@/server/queries/entries";
import { LineCostsForm } from "./line-costs-form";
import { SupplierCreditForm } from "./supplier-credit-form";
import { VoidDialog } from "./void-dialog";
import { RETURNED_TRASHED } from "@/lib/stock/details";

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
  const when = (d: Date) => format.dateTime(d, "dateTime");
  const units = entry.lines.reduce((s, l) => s + l.quantity, 0);
  const printable = (entry.type === "OUT" || entry.type === "TRANSFER_OUT") && !entry.voidedAt;
  // A manager voids only in his warehouses — both of them for a transfer (the server checks again).
  const partner = rel.transferIn ?? rel.transferOut;
  const pendingVoid = entry.voidRequests[0] ?? null;
  const canVoid =
    can(user.role, "entry:void") &&
    entry.type !== "VOID" &&
    !entry.voidedAt &&
    !pendingVoid &&
    canWriteToWarehouse(user, entry.warehouse.id) &&
    (!partner || canWriteToWarehouse(user, partner.warehouse.id));

  // Money on this entry: cost:view roles see it; a MANAGER sees and enters it for his own warehouses.
  const canEnterMoney = can(user.role, "cost:enter") && canWriteToWarehouse(user, entry.warehouse.id) && !entry.voidedAt;
  const showMoney = can(user.role, "cost:view") || canEnterMoney;
  const money = showMoney && (entry.reason === "SUPPLIER_DELIVERY" || entry.reason === "SUPPLIER_RETURN") ? await getEntryMoney(entry.id) : null;
  const photos = entry.attachments.length ? entry.attachments.map((a) => `/api/attachments/${a.attachmentId}`) : entry.photoUrl ? [entry.photoUrl] : [];

  /** Names and dates inside a sentence keep their own direction (a Latin name in Arabic text). */
  const isolate = (s: string) => `\u2068${s}\u2069`;

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
  if (entry.itemCondition) {
    const c = entry.itemCondition;
    details.push([t("entryForm.returnCondition"), t.has(`entryForm.${c}` as "entryForm.BROKEN") ? t(`entryForm.${c}` as "entryForm.BROKEN") : c]);
  }
  if (entry.salesChannel) {
    const c = entry.salesChannel;
    details.push([t("entryForm.salesChannel"), t.has(`entryForm.channels.${c}` as "entryForm.channels.WEBSITE") ? t(`entryForm.channels.${c}` as "entryForm.channels.WEBSITE") : c]);
  }
  if (entry.reasonCode) {
    details.push([
      t(entry.reason === "DAMAGED_LOST" ? "entryForm.damageReason" : "entryForm.returnReason"),
      t.has(`entryForm.codes.${entry.reasonCode}` as "entryForm.codes.OTHER") ? t(`entryForm.codes.${entry.reasonCode}` as "entryForm.codes.OTHER") : entry.reasonCode,
    ]);
  }
  if (entry.paymentMethod) {
    details.push([t("entries.paymentMethod"), t.has(`entryForm.payment.${entry.paymentMethod}` as "entryForm.payment.CASH") ? t(`entryForm.payment.${entry.paymentMethod}` as "entryForm.payment.CASH") : entry.paymentMethod]);
  }
  if (entry.salesperson) details.push([t("entries.salesperson"), <bdi key="sp">{entry.salesperson}</bdi>]);
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
              isTrashedPair={entry.itemCondition === "TRASHED" || entry.reasonCode === RETURNED_TRASHED}
            />
          )}
        </div>
      </div>

      {/* Audit trail: who did what, when */}
      <Card>
        <CardContent className="space-y-1 text-sm">
          <p>{t("entries.created", { name: isolate(entry.createdBy.name), date: isolate(when(entry.createdAt)) })}</p>
          {entry.approvedVia && (
            <p>
              <Link href={`/approvals/${entry.approvedVia.id}`} className="underline underline-offset-4">
                {t("approvals.approvedVia", { name: entry.approvedVia.decidedBy?.name ?? "—", number: entry.approvedVia.number })}
              </Link>
            </p>
          )}
          {pendingVoid && (
            <p className="text-amber-700 dark:text-amber-400">
              {t("entries.voidRequested")}:{" "}
              <Link href={`/approvals/${pendingVoid.id}`} className="font-medium underline underline-offset-4">
                <Ltr>{pendingVoid.number}</Ltr>
              </Link>
            </p>
          )}
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
          {entry.originalEntry && (
            <p>
              {t(entry.reason === "DAMAGED_LOST" ? "entries.writeOffOf" : "entries.returnOf")}: {linkTo(entry.originalEntry)}
            </p>
          )}
          {entry.writeOffs.length > 0 && (
            <p>
              {t("entries.writtenOffIn")}:{" "}
              {entry.writeOffs.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ", "}
                  {linkTo(r)}
                </span>
              ))}
            </p>
          )}
          {entry.returns.length > 0 && (
            <p>
              {t("entries.returnedIn")}:{" "}
              {entry.returns.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ", "}
                  {linkTo(r)}
                </span>
              ))}
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
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {details.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {photos.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {photos.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-protected route */}
                  <img src={url} alt={t("photo.numbered", { n: i + 1 })} className="h-32 rounded-md border object-cover" />
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {money && entry.reason === "SUPPLIER_DELIVERY" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("entries.costs")}</CardTitle>
          </CardHeader>
          <CardContent>
            <LineCostsForm
              entryId={entry.id}
              editable={canEnterMoney}
              lines={entry.lines.map((l) => ({
                id: l.id,
                modelCode: l.product.modelCode,
                quantity: l.quantity,
                unitCost: money.lineCosts[l.id]?.unitCost ?? null,
                enteredBy: money.lineCosts[l.id]?.enteredBy ?? null,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {money?.supplierReturn && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("entries.supplierCredit")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {t(`entries.creditStatus.${money.supplierReturn.status}`)}
              {money.supplierReturn.creditReceivedAt && <> · {when(money.supplierReturn.creditReceivedAt)}</>}
            </p>
            <p>
              {t("entries.expectedCredit")}: <Ltr>{money.supplierReturn.expectedCredit ?? "—"}</Ltr>
              {money.supplierReturn.creditAmount && (
                <>
                  {" · "}
                  {t("entries.creditAmount")}: <Ltr>{money.supplierReturn.creditAmount}</Ltr>
                </>
              )}
            </p>
            {canEnterMoney && <SupplierCreditForm entryId={entry.id} status={money.supplierReturn.status} />}
          </CardContent>
        </Card>
      )}

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
                <span className="text-lg font-semibold tabular-nums">× {format.number(l.quantity, "qty")}</span>
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
