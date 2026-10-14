import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/server/auth/dal";
import { productFormOptions } from "@/server/queries/products";
import { ProductForm } from "../product-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("products"))("newTitle") };
}

export default async function NewProductPage() {
  await requirePagePermission("product:manage");
  const [t, options, locale] = await Promise.all([getTranslations("products"), productFormOptions(), getLocale()]);
  return (
    <>
      <PageHeader title={t("newTitle")} />
      <ProductForm options={options} locale={locale} />
    </>
  );
}
