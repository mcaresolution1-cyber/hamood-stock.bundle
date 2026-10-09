import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/server/auth/dal";
import { ProductForm } from "../product-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("products"))("newTitle") };
}

export default async function NewProductPage() {
  await requirePagePermission("product:manage");
  const t = await getTranslations("products");
  return (
    <>
      <PageHeader title={t("newTitle")} />
      <ProductForm />
    </>
  );
}
