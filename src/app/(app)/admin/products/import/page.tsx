import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/server/auth/dal";
import { ImportForm } from "./import-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("import"))("title") };
}

export default async function ImportProductsPage() {
  await requirePagePermission("product:manage");
  const t = await getTranslations("import");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ImportForm />
    </>
  );
}
