"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { SelectField, TextField, applyActionErrors } from "@/components/form-fields";
import { useMessage } from "@/components/use-message";
import { PRODUCT_STATUSES } from "@/lib/products";
import { CategoryPicker, type CategoryOption } from "@/components/category-picker";
import { FormField, FormItem, FormMessage } from "@/components/ui/form";
import { productSchema, type ProductFormValues, type ProductInput } from "@/lib/validation/products";
import { createProduct, updateProduct } from "@/server/actions/products";
import { runAction } from "@/lib/run-action";
import type { ActionResult } from "@/server/actions/result";
import { ProductImageInput } from "./product-image-input";

type Option = { id: string; name: string };
export type ProductFormOptions = {
  suppliers: { id: string; nameEn: string; nameAr: string | null }[];
  warehouses: Option[];
  categories: CategoryOption[];
};
type Reorder = { warehouseId: string; reorderLevel: number; reorderQty: number };

const EMPTY: Omit<ProductFormValues, "reorder"> = {
  modelCode: "",
  sku: "",
  barcode: "",
  nameEn: "",
  nameAr: "",
  categoryIds: [],
  status: "ACTIVE",
  variant: "",
  sizeRange: "",
  colour: "",
  maxLoadKg: "",
  vesa: "",
  imageUrl: "",
  cost: "",
  sellingPrice: "",
  lowStockLevel: "0",
  leadTimeDays: "",
  wooProductId: "",
  wooSku: "",
  defaultSupplierId: "",
};

/** Several categories (PU2), through the form context like the other fields. */
function CategoriesField({ options }: { options: CategoryOption[] }) {
  const t = useTranslations("products");
  const message = useMessage();
  const { control } = useFormContext<ProductFormValues>();
  return (
    <FormField
      control={control}
      name="categoryIds"
      render={({ field, fieldState }) => (
        <FormItem className="sm:col-span-2">
          <p id="categories-label" className="text-sm font-medium">
            {t("categories")}
          </p>
          <p id="categories-hint" className="text-sm text-muted-foreground">
            {t("categoriesHint")}
          </p>
          <CategoryPicker
            options={options}
            value={field.value ?? []}
            onChange={(ids) => field.onChange(ids)}
            invalid={Boolean(fieldState.error)}
            describedBy="categories-label categories-hint"
          />
          <FormMessage>{message(fieldState.error?.message)}</FormMessage>
        </FormItem>
      )}
    />
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t pt-5 first:border-t-0 first:pt-0 sm:grid-cols-2">
      <legend className="sr-only">{title}</legend>
      <div className="sm:col-span-2">
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </fieldset>
  );
}

export function ProductForm({
  product,
  options,
  locale,
}: {
  product?: { id: string; values: Omit<ProductFormValues, "reorder">; reorder: Reorder[] };
  options: ProductFormOptions;
  locale: string;
}) {
  const t = useTranslations();
  const message = useMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // One reorder row per active sellable warehouse; empty = use the product's default level.
  const reorder = options.warehouses.map((w) => {
    const r = product?.reorder.find((x) => x.warehouseId === w.id);
    return { warehouseId: w.id, reorderLevel: r ? String(r.reorderLevel) : "", reorderQty: r ? String(r.reorderQty) : "" };
  });
  const form = useForm<ProductFormValues, unknown, ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: { ...(product?.values ?? EMPTY), reorder },
  });
  const imageUrl = useWatch({ control: form.control, name: "imageUrl" });
  const status = useWatch({ control: form.control, name: "status" });

  // The server re-validates with the same schema, so it must get the RAW form values (text), not the
  // parsed ones handleSubmit passes in (null / numbers would fail the server's string checks).
  function onSubmit() {
    const values = form.getValues();
    startTransition(async () => {
      const result = await runAction<ActionResult<unknown>>(() => (product ? updateProduct(product.id, values) : createProduct(values)), { retry: Boolean(product) });
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

  const statuses = product ? PRODUCT_STATUSES : PRODUCT_STATUSES.filter((s) => s !== "INACTIVE");
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-3xl gap-6" noValidate>
        <Section title={t("products.sections.identity")}>
          <TextField name="modelCode" label={t("products.modelCode")} hint={t("products.modelCodeHint")} dir="ltr" autoCapitalize="characters" />
          <TextField name="sku" label={t("products.sku")} hint={t("products.skuHint")} dir="ltr" autoCapitalize="characters" optional />
          <TextField name="nameEn" label={t("products.nameEn")} dir="ltr" />
          <TextField name="nameAr" label={t("products.nameAr")} dir="rtl" lang="ar" />
          <CategoriesField options={options.categories} />
          <SelectField
            name="status"
            label={t("products.status")}
            hint={t(`products.statusHelp.${status ?? "ACTIVE"}`)}
            options={statuses.map((s) => ({ value: s, label: t(`products.statuses.${s}`) }))}
          />
          <TextField name="barcode" label={t("products.barcode")} hint={t("products.barcodeHint")} dir="ltr" inputMode="numeric" optional />
        </Section>

        <Section title={t("products.sections.details")}>
          <TextField name="sizeRange" label={t("products.sizeRange")} placeholder="32–70″" dir="ltr" optional />
          <TextField name="colour" label={t("products.colour")} optional />
          <TextField name="maxLoadKg" label={t("products.maxLoadKg")} inputMode="numeric" dir="ltr" optional />
          <TextField name="vesa" label={t("products.vesa")} placeholder="600×400" dir="ltr" optional />
          <div className="sm:col-span-2">
            <TextField name="variant" label={t("products.variant")} hint={t("products.variantHint")} optional />
          </div>
          <div className="space-y-3 sm:col-span-2">
            <p className="text-sm font-medium">{t("products.image")}</p>
            <ProductImageInput value={imageUrl ?? ""} onChange={(url) => form.setValue("imageUrl", url, { shouldDirty: true, shouldValidate: true })} />
            {/* An uploaded photo's internal path means nothing to people; the link field is for outside images. */}
            {!(imageUrl ?? "").startsWith("/api/product-images/") && (
              <TextField name="imageUrl" type="url" dir="ltr" label={t("products.imageUrl")} hint={t("products.imageUrlHint")} optional placeholder="https://" />
            )}
          </div>
        </Section>

        <Section title={t("products.sections.prices")}>
          <TextField name="sellingPrice" inputMode="decimal" dir="ltr" label={t("products.sellingPrice")} optional />
          <TextField name="cost" inputMode="decimal" dir="ltr" label={t("products.cost")} hint={t("products.costHint")} optional />
          <SelectField
            name="defaultSupplierId"
            label={t("products.defaultSupplier")}
            optional
            placeholder={t("common.none")}
            options={options.suppliers.map((s) => ({ value: s.id, label: locale === "ar" && s.nameAr ? s.nameAr : s.nameEn }))}
          />
          <TextField name="leadTimeDays" inputMode="numeric" dir="ltr" label={t("products.leadTimeDays")} optional />
        </Section>

        <Section title={t("products.sections.stock")} hint={t("products.reorderHint")}>
          <TextField name="lowStockLevel" inputMode="numeric" dir="ltr" label={t("products.lowStockLevel")} hint={t("products.lowStockHint")} />
          <div className="sm:col-span-2">
            {options.warehouses.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-start">
                    <tr>
                      <th className="p-2 text-start font-medium">{t("entryForm.warehouse")}</th>
                      <th className="p-2 text-start font-medium">{t("products.reorderLevel")}</th>
                      <th className="p-2 text-start font-medium">{t("products.reorderQty")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {options.warehouses.map((w, i) => (
                      <tr key={w.id} className="border-t align-top">
                        <td className="p-2 pt-4 font-medium">{w.name}</td>
                        <td className="p-2">
                          <TextField name={`reorder.${i}.reorderLevel`} label={t("products.reorderLevelFor", { warehouse: w.name })} hideLabel inputMode="numeric" dir="ltr" />
                        </td>
                        <td className="p-2">
                          <TextField name={`reorder.${i}.reorderQty`} label={t("products.reorderQtyFor", { warehouse: w.name })} hideLabel inputMode="numeric" dir="ltr" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Section>

        <Section title={t("products.sections.website")}>
          <TextField name="wooProductId" inputMode="numeric" dir="ltr" label={t("products.wooProductId")} optional />
          <TextField name="wooSku" dir="ltr" label={t("products.wooSku")} optional />
        </Section>

        <div className="flex gap-2">
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
