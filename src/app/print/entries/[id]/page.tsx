/**
 * Printable delivery note (A4) for stock out and transfers. Always bilingual — English on the left,
 * Arabic on the right — whatever language the user has chosen. Never shows cost.
 * Lives outside the (app) group so it prints without the top bar.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser, requirePagePermission } from "@/server/auth/dal";
import { getEntry, relatedEntries } from "@/server/queries/entries";
import { PrintButton } from "./print-button";

export async function generateMetadata({ params }: PageProps<"/print/entries/[id]">): Promise<Metadata> {
  // No DB read before the access check.
  if (!(await getCurrentUser())) return { title: "—" };
  const [e, en, ar] = await Promise.all([
    getEntry((await params).id),
    getTranslations({ locale: "en", namespace: "deliveryNote" }),
    getTranslations({ locale: "ar", namespace: "deliveryNote" }),
  ]);
  return { title: e ? `${e.number} · ${en("title")} · ${ar("title")}` : "—" };
}

const riyadh = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Riyadh",
  dateStyle: "medium",
  timeStyle: "short",
});

function Pair({ en, ar }: { en: string; ar: string }) {
  return (
    <span className="flex justify-between gap-2 text-xs text-zinc-500">
      <span>{en}</span>
      <span dir="rtl" lang="ar">
        {ar}
      </span>
    </span>
  );
}

export default async function DeliveryNotePage({ params }: PageProps<"/print/entries/[id]">) {
  await requirePagePermission("stock:view");
  const entry = await getEntry((await params).id);
  if (!entry) notFound();
  const [en, ar, tUi] = await Promise.all([
    getTranslations({ locale: "en", namespace: "deliveryNote" }),
    getTranslations({ locale: "ar", namespace: "deliveryNote" }),
    getTranslations("deliveryNote"),
  ]);
  const [enCommon, arCommon] = await Promise.all([
    getTranslations({ locale: "en", namespace: "common" }),
    getTranslations({ locale: "ar", namespace: "common" }),
  ]);
  const [enR, arR] = await Promise.all([
    getTranslations({ locale: "en", namespace: "reasons" }),
    getTranslations({ locale: "ar", namespace: "reasons" }),
  ]);

  if (entry.type !== "OUT" && entry.type !== "TRANSFER_OUT") {
    return <p className="p-8 text-center text-muted-foreground">{tUi("notOutgoing")}</p>;
  }
  // A voided entry must never produce a clean delivery note.
  if (entry.voidedAt) {
    return <p className="p-8 text-center text-destructive">{tUi("voided", { number: entry.number })}</p>;
  }
  const rel = relatedEntries(entry);
  const units = entry.lines.reduce((s, l) => s + l.quantity, 0);
  const to = rel.transferIn?.warehouse.name ?? entry.customerName ?? entry.technicianName ?? "—";

  const fields: { en: string; ar: string; value: React.ReactNode }[] = [
    { en: en("number"), ar: ar("number"), value: entry.number },
    { en: en("date"), ar: ar("date"), value: riyadh.format(entry.entryDate) },
    { en: en("from"), ar: ar("from"), value: entry.warehouse.name },
    { en: en("to"), ar: ar("to"), value: to },
  ];
  if (entry.customerPhone) fields.push({ en: en("phone"), ar: ar("phone"), value: entry.customerPhone });
  if (entry.technicianName && rel.transferIn === null && entry.customerName)
    fields.push({ en: en("technician"), ar: ar("technician"), value: entry.technicianName });
  if (entry.reference) fields.push({ en: en("reference"), ar: ar("reference"), value: entry.reference });

  return (
    <div className="min-h-dvh bg-zinc-100 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 12mm; } @media print { html, body { background: white; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-4 print:hidden">
        <PrintButton label={tUi("print")} />
      </div>

      <article dir="ltr" className="mx-auto max-w-[210mm] bg-white p-[12mm] text-zinc-900 shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-zinc-900 pb-4">
          <div>
            <p className="text-xl font-bold">{enCommon("companyName")}</p>
            <p className="text-xs text-zinc-500">{en("address")}</p>
          </div>
          <div className="text-right" dir="rtl" lang="ar">
            <p className="text-xl font-bold">{arCommon("companyName")}</p>
            <p className="text-xs text-zinc-500">{ar("address")}</p>
          </div>
        </header>

        <h1 className="my-5 flex items-baseline justify-between text-2xl font-bold">
          <span>{en("title")}</span>
          <span className="text-base font-medium text-zinc-500">
            {enR(entry.reason)} · <span lang="ar">{arR(entry.reason)}</span>
          </span>
          <span dir="rtl" lang="ar">
            {ar("title")}
          </span>
        </h1>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {fields.map((f) => (
            <div key={f.en}>
              <dt>
                <Pair en={f.en} ar={f.ar} />
              </dt>
              <dd className="mt-0.5 border-b border-zinc-200 pb-1 font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y-2 border-zinc-900 text-left">
              <th className="w-10 py-2">#</th>
              <th className="py-2 pe-6">
                <Pair en={en("product")} ar={ar("product")} />
              </th>
              <th className="w-28 py-2 ps-4 text-right">
                <Pair en={en("qty")} ar={ar("qty")} />
              </th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((l, i) => (
              <tr key={l.id} className="break-inside-avoid border-b border-zinc-200 align-top">
                <td className="py-2 tabular-nums">{i + 1}</td>
                <td className="py-2 pe-6">
                  <div className="font-semibold">{l.product.modelCode}</div>
                  <div className="flex justify-between gap-4">
                    <span>{l.product.nameEn}</span>
                    <span dir="rtl" lang="ar">
                      {l.product.nameAr}
                    </span>
                  </div>
                </td>
                <td className="py-2 text-right text-base font-semibold tabular-nums">{l.quantity}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-900">
              <td />
              <td className="py-2 pe-6">
                <Pair en={en("total")} ar={ar("total")} />
              </td>
              <td className="py-2 text-right text-base font-bold tabular-nums">{units}</td>
            </tr>
          </tfoot>
        </table>

        <section className="mt-16 grid grid-cols-2 gap-12 break-inside-avoid text-sm">
          {(["deliveredBy", "receivedBy"] as const).map((k) => (
            <div key={k}>
              <Pair en={en(k)} ar={ar(k)} />
              <div className="mt-12 border-t border-zinc-400 pt-1">
                <Pair en={en("signature")} ar={ar("signature")} />
              </div>
            </div>
          ))}
        </section>
      </article>
    </div>
  );
}
