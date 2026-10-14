import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <PageHeader
        title={t("newTitle")}
        description={t("newSubtitle")}
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/products/import">
              <UploadIcon className="size-4" aria-hidden />
              {t("importMany")}
            </Link>
          </Button>
        }
      />
      <ProductForm options={options} locale={locale} />
    </>
  );
}
