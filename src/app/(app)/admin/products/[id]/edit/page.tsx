import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/server/auth/dal";
import { getProductForEdit, productFormOptions } from "@/server/queries/products";
import { ProductForm } from "../../product-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("products"))("title") };
}

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]/edit">) {
  await requirePagePermission("product:manage");
  const { id } = await params;
  const product = await getProductForEdit(id);
  if (!product) notFound();
  const [t, options, locale] = await Promise.all([getTranslations("products"), productFormOptions(product.values.defaultSupplierId, product.values.categoryIds), getLocale()]);

  return (
    <>
      <PageHeader title={t("editTitle", { modelCode: product.values.modelCode })} />
      <ProductForm product={{ id: product.id, values: product.values, reorder: product.reorder }} options={options} locale={locale} />
    </>
  );
}
