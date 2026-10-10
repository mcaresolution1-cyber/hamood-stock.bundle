import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { EntryWizard } from "@/components/stock/entry-wizard";
import { requirePagePermission } from "@/server/auth/dal";
import { loadEntryForm } from "@/server/queries/entry-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("stockIn"))("title") };
}

export default async function StockInPage() {
  const user = await requirePagePermission("entry:create");
  const [t, data] = await Promise.all([getTranslations("stockIn"), loadEntryForm(user, "IN")]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <EntryWizard key={data.direction} data={data} />
    </div>
  );
}
