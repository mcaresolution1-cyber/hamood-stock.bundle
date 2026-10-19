import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmAction } from "@/components/confirm-action";
import { Ltr } from "@/components/ltr";
import { RequestStatusBadge } from "@/components/request-badge";
import { requireUser } from "@/server/auth/dal";
import { cancelRequestAction } from "@/server/actions/approvals";
import { canUseApprovals, getRequest } from "@/server/queries/approvals";
import { AUTO_CANCELLED_NOTE, decideError } from "@/server/stock/approvals";
import { DecideButtons } from "./decide-buttons";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("approvals"))("title") };
}

export default async function RequestPage({ params }: PageProps<"/approvals/[id]">) {
  const user = await requireUser();
  if (!canUseApprovals(user)) redirect("/?denied=1");
  const request = await getRequest(user, (await params).id);
  if (!request) notFound();
  const [t, tc, format, locale] = await Promise.all([getTranslations(), getTranslations("common"), getFormatter(), getLocale()]);
  const when = (d: Date) => format.dateTime(d, "dateTime");

  const pending = request.status === "PENDING";
  const own = request.requestedById === user.id;
  const mayDecide = pending && decideError(user, request) === null;
  const autoCancelled = request.status === "CANCELLED" && request.decisionNote === AUTO_CANCELLED_NOTE;

  const what =
    t(`approvals.rules.${request.rule as "correction"}`) +
    (request.direction ? ` · ${t(`approvals.direction.${request.direction}`)}` : "");
  const details: [string, React.ReactNode][] = [
    [t("approvals.what"), what],
    [t("approvals.warehouse"), request.otherWarehouse ? `${request.warehouse.name} → ${request.otherWarehouse.name}` : request.warehouse.name],
    [t("approvals.requestedBy"), `${request.requestedBy.name} · ${when(request.requestedAt)}`],
    [t("approvals.units"), tc("units", { count: request.units })],
  ];
  if (request.value !== null) details.push([t("approvals.value"), <Ltr key="v">{`${request.value} SAR`}</Ltr>]);
  if (request.targetEntry) {
    details.push([
      t("approvals.entryToVoid"),
      <Link key="t" href={`/entries/${request.targetEntry.id}`} className="underline underline-offset-4">
        <Ltr>{request.targetEntry.number}</Ltr>
      </Link>,
    ]);
  }
  if (request.note) details.push([request.kind === "VOID" ? t("approvals.voidReason") : t("approvals.note"), request.note]);
  if (request.decidedAt && request.decidedBy && !autoCancelled) {
    details.push([t("approvals.decidedBy"), `${request.decidedBy.name} · ${when(request.decidedAt)}`]);
  }
  if (request.decisionNote && !autoCancelled) details.push([t("approvals.decisionNote"), request.decisionNote]);
  if (request.resultEntry) {
    details.push([
      t("approvals.result"),
      <Link key="r" href={`/entries/${request.resultEntry.id}`} className="font-medium underline underline-offset-4">
        <Ltr>{request.resultEntry.number}</Ltr>
      </Link>,
    ]);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ms-2">
        <Link href="/approvals">
          <ArrowLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
          {t("approvals.title")}
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <Ltr>{request.number}</Ltr>
          </h1>
          <div className="mt-1">
            <RequestStatusBadge status={request.status} />
          </div>
        </div>
        {mayDecide && <DecideButtons requestId={request.id} number={request.number} />}
        {pending && own && (
          <ConfirmAction
            label={t("approvals.withdraw")}
            title={t("approvals.withdrawConfirm", { number: request.number })}
            action={cancelRequestAction.bind(null, request.id)}
          />
        )}
      </div>

      {pending && !mayDecide && (
        <p className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
          {own ? t("approvals.ownHint") : t("approvals.notYoursHint")}
        </p>
      )}
      {pending && request.targetEntry?.voided && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {t("approvals.alreadyVoided")}
        </p>
      )}
      {autoCancelled && <p className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">{t("approvals.autoCancelled")}</p>}

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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("entries.lines")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {request.lines.map((l) => (
              <li key={l.productId} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  {l.product ? (
                    <>
                      <Ltr className="block font-medium">{l.product.modelCode}</Ltr>
                      <span className="block truncate text-sm text-muted-foreground">
                        {locale === "ar" ? l.product.nameAr : l.product.nameEn}
                        {l.product.variant ? ` · ${l.product.variant}` : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t("approvals.unknownProduct")}</span>
                  )}
                </div>
                <span className="text-lg font-semibold tabular-nums">× {format.number(l.quantity, "qty")}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
