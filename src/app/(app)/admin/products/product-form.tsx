"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { SelectField, TextField, applyActionErrors } from "@/components/form-fields";
import { useMessage } from "@/components/use-message";
import { CATEGORIES } from "@/lib/products";
import { productSchema, type ProductFormValues, type ProductInput } from "@/lib/validation/products";
import { createProduct, updateProduct } from "@/server/actions/products";

const EMPTY: ProductFormValues = {
  modelCode: "",
  nameEn: "",
  nameAr: "",
  category: "wall-mount",
  variant: "",
  imageUrl: "",
  cost: "",
  lowStockLevel: "0",
};

export function ProductForm({ product }: { product?: { id: string } & ProductFormValues }) {
  const t = useTranslations();
  const message = useMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<ProductFormValues, unknown, ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: product ?? EMPTY,
  });

  // The server re-validates with the same schema, so it must get the RAW form values (text), not the
  // parsed ones handleSubmit passes in (null / numbers would fail the server's string checks).
  function onSubmit() {
    const values = form.getValues();
    startTransition(async () => {
      const result = product ? await updateProduct(product.id, values) : await createProduct(values);
      if (result.ok) {
        toast.success(product ? t("products.updated") : t("products.created"));
        router.push("/admin/products");
        router.refresh();
      } else {
        const formError = applyActionErrors(form, result);
        if (formError) toast.error(message(formError, result.params));
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-2xl gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <TextField name="modelCode" label={t("products.modelCode")} hint={t("products.modelCodeHint")} dir="ltr" autoCapitalize="characters" />
        </div>
        <TextField name="nameEn" label={t("products.nameEn")} dir="ltr" />
        <TextField name="nameAr" label={t("products.nameAr")} dir="rtl" lang="ar" />
        <SelectField
          name="category"
          label={t("products.category")}
          options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
        />
        <TextField name="variant" label={t("products.variant")} hint={t("products.variantHint")} optional />
        <div className="sm:col-span-2">
          <TextField name="imageUrl" type="url" dir="ltr" label={t("products.imageUrl")} optional placeholder="https://" />
        </div>
        <TextField name="cost" inputMode="decimal" dir="ltr" label={t("products.cost")} hint={t("products.costHint")} optional />
        <TextField name="lowStockLevel" inputMode="numeric" dir="ltr" label={t("products.lowStockLevel")} hint={t("products.lowStockHint")} />
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={pending} className="h-11 min-w-32">
            {pending ? t("common.saving") : t("common.save")}
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
