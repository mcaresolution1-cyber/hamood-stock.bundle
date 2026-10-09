import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/server/auth/dal";
import { getProductForEdit } from "@/server/queries/products";
import { isCategory } from "@/lib/products";
import { ProductForm } from "../../product-form";

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]/edit">) {
  await requirePagePermission("product:manage");
  const { id } = await params;
  const product = await getProductForEdit(id);
  if (!product) notFound();
  const t = await getTranslations("products");

  return (
    <>
      <PageHeader title={t("editTitle", { modelCode: product.modelCode })} />
      <ProductForm
        product={{
          id: product.id,
          modelCode: product.modelCode,
          nameEn: product.nameEn,
          nameAr: product.nameAr,
          category: isCategory(product.category) ? product.category : "wall-mount",
          variant: product.variant ?? "",
          imageUrl: product.imageUrl ?? "",
          cost: product.cost ?? "",
          lowStockLevel: String(product.lowStockLevel),
        }}
      />
    </>
  );
}
