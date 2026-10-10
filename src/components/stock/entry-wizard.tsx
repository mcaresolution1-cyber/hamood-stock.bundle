"use client";

/**
 * Stock In / Stock Out form: fill in → review → saved. Built for one-handed phone use: big reason
 * cards, warehouse pre-selected when there's only one, stepper quantities, a sticky action bar.
 * The same Zod schema runs here and in the server action; the entry service has the final word.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2Icon, PrinterIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { SelectField, TextField, applyActionErrors } from "@/components/form-fields";
import { useMessage } from "@/components/use-message";
import { ProductThumb } from "@/components/product-thumb";
import { Ltr } from "@/components/ltr";
import { ProductPicker } from "./product-picker";
import { QuantityStepper } from "./quantity-stepper";
import { PhotoInput } from "./photo-input";
import { cn } from "@/lib/utils";
import { normalizeNumberText } from "@/lib/import/normalize";
import { fieldsFor, noteRequired, type DetailField } from "@/lib/stock/fields";
import { destinationWarehouses, sourceWarehouses } from "@/lib/stock/warehouse-options";
import { emptyEntryForm, entryFormSchema, type EntryFormValues } from "@/lib/validation/entries";
import type { EntryReason } from "@/generated/prisma/enums";
import type { EntryFormData } from "@/server/queries/entry-form";
import type { SavedEntry } from "@/server/stock/createEntry";
import { saveEntry } from "@/server/actions/entries";

type Step = "form" | "review" | "done";

const DETAIL_LABEL: Record<Exclude<DetailField, "returnCondition" | "destinationWarehouseId">, string> = {
  supplierName: "supplierName",
  reference: "reference",
  customerName: "customerName",
  customerPhone: "customerPhone",
  technicianName: "technicianName",
};

/** The reference field means different things per reason. */
function referenceLabel(reason: string) {
  if (reason === "SUPPLIER_DELIVERY") return "invoiceNo";
  if (reason === "WEBSITE_ORDER") return "wooOrderNo";
  if (reason === "CUSTOMER_RETURN" || reason === "INSTALLATION" || reason === "DIRECT_SALE") return "orderNo";
  return "reference";
}

export function EntryWizard({ data }: { data: EntryFormData }) {
  const t = useTranslations();
  const message = useMessage();
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [saved, setSaved] = useState<SavedEntry | null>(null);
  const [lastValues, setLastValues] = useState<EntryFormValues | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema) as never,
    defaultValues: emptyEntryForm(data.direction),
    mode: "onTouched",
  });
  const values = useWatch({ control: form.control }) as EntryFormValues;
  const reason = values.reason as EntryReason | "";

  const sources = useMemo(
    () => sourceWarehouses(data.warehouses, reason, values.returnCondition),
    [data.warehouses, reason, values.returnCondition],
  );
  const destinations = useMemo(
    () => destinationWarehouses(data.warehouses, values.warehouseId),
    [data.warehouses, values.warehouseId],
  );

  // Keep the warehouse valid for the chosen reason; pre-select when there's exactly one choice.
  useEffect(() => {
    const current = form.getValues("warehouseId");
    if (current && sources.some((w) => w.id === current)) return;
    form.setValue("warehouseId", sources.length === 1 ? sources[0].id : "", { shouldValidate: false });
  }, [sources, form]);

  const stock = data.stock[values.warehouseId] ?? {};
  const warehouseName = data.warehouses.find((w) => w.id === values.warehouseId)?.name ?? "";
  const productById = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);

  const overLimit = (values.lines ?? []).filter((l) => {
    if (data.direction !== "OUT") return false;
    const q = Number(normalizeNumberText(l.quantity ?? ""));
    return q > (stock[l.productId ?? ""] ?? 0);
  });

  async function toReview() {
    const ok = await form.trigger();
    if (!ok) {
      toast.error(t("errors.invalidInput"));
      return;
    }
    if (overLimit.length) {
      toast.error(t("entryForm.errors.overAvailable"));
      return;
    }
    setStep("review");
    window.scrollTo({ top: 0 });
  }

  function save() {
    startTransition(async () => {
      const current = form.getValues();
      const result = await saveEntry(current);
      if (result.ok) {
        setSaved(result.data);
        setLastValues({ ...current, photoUrl: "" });
        setStep("done");
        router.refresh(); // fresh stock numbers for the next entry
        window.scrollTo({ top: 0 });
      } else {
        const formError = applyActionErrors(form, result);
        toast.error(message(formError ?? "errors.invalidInput", result.params));
        if (!formError) setStep("form");
      }
    });
  }

  function restart(values: EntryFormValues) {
    form.reset(values);
    setSaved(null);
    setStep("form");
    window.scrollTo({ top: 0 });
  }

  if (data.reasons.length === 0) return <p className="text-muted-foreground">{t("entryForm.noReasons")}</p>;
  if (!data.warehouses.some((w) => w.writable)) {
    return <p className="rounded-md border p-4 text-muted-foreground">{t("entryForm.noWarehouses")}</p>;
  }

  if (step === "done" && saved) {
    return (
      <DoneStep
        saved={saved}
        direction={data.direction}
        reason={(lastValues?.reason ?? "") as EntryReason}
        onNew={() => restart({ ...emptyEntryForm(data.direction), reason: lastValues?.reason ?? "", warehouseId: lastValues?.warehouseId ?? "" })}
        onRepeat={() => lastValues && restart(lastValues)}
      />
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={(e) => e.preventDefault()} noValidate className="space-y-4 pb-28">
        {step === "form" ? (
          <>
            <ReasonPicker form={form} reasons={data.reasons} direction={data.direction} />

            {reason === "CUSTOMER_RETURN" && <ConditionPicker form={form} />}

            {reason && (
              <Card>
                <CardContent className="space-y-4 pt-6">
                  <SelectField
                    name="warehouseId"
                    label={reason === "TRANSFER" ? t("entryForm.fromWarehouse") : t("entryForm.warehouse")}
                    placeholder={t("entryForm.chooseWarehouse")}
                    options={sources.map((w) => ({
                      value: w.id,
                      label: w.kind === "DAMAGED" ? `${w.name} · ${t("warehouseKinds.DAMAGED")}` : w.name,
                    }))}
                  />
                  {reason === "TRANSFER" && (
                    <SelectField
                      name="destinationWarehouseId"
                      label={t("entryForm.toWarehouse")}
                      placeholder={t("entryForm.chooseWarehouse")}
                      options={destinations.map((w) => ({ value: w.id, label: w.name }))}
                    />
                  )}
                  {fieldsFor(reason)
                    .filter((f) => f.field in DETAIL_LABEL)
                    .map(({ field, required }) => (
                      <TextField
                        key={field}
                        name={field}
                        optional={!required && !(reason === "CUSTOMER_RETURN" && (field === "reference" || field === "customerName"))}
                        label={t(`entryForm.${field === "reference" ? referenceLabel(reason) : DETAIL_LABEL[field as keyof typeof DETAIL_LABEL]}` as never)}
                        {...(field === "customerPhone" ? { inputMode: "tel" as const, dir: "ltr", autoComplete: "tel" } : {})}
                        {...(field === "reference" ? { dir: "ltr" } : {})}
                      />
                    ))}
                  <TextField name="note" label={t("entryForm.note")} optional={!noteRequired(reason)} />
                  {data.direction === "IN" && (
                    <PhotoInput
                      value={values.photoUrl ?? ""}
                      onChange={(url) => form.setValue("photoUrl", url, { shouldDirty: true })}
                    />
                  )}
                </CardContent>
              </Card>
            )}

            {reason && (
              <LinesEditor
                form={form}
                data={data}
                stock={data.direction === "OUT" ? stock : undefined}
                warehouseName={warehouseName}
                disabled={!values.warehouseId}
              />
            )}

            <StickyBar>
              <Button type="button" className="h-12 w-full text-base" onClick={toReview} disabled={!reason}>
                {reason ? t("entryForm.review") : t("entryForm.pickReasonFirst")}
              </Button>
            </StickyBar>
          </>
        ) : (
          <>
            <Summary values={form.getValues()} data={data} productById={productById} />
            <StickyBar>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-12 flex-1 text-base" onClick={() => setStep("form")} disabled={pending}>
                  {t("entryForm.back")}
                </Button>
                <Button type="button" className="h-12 flex-[2] text-base" onClick={save} disabled={pending}>
                  {pending ? t("entryForm.saving") : t("entryForm.save")}
                </Button>
              </div>
            </StickyBar>
          </>
        )}
      </form>
    </Form>
  );
}

function StickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );
}

function reasonLabel(t: ReturnType<typeof useTranslations>, reason: string, direction: "IN" | "OUT") {
  if (reason === "CORRECTION") return t((direction === "IN" ? "entryForm.correctionIn" : "entryForm.correctionOut") as never);
  return t(`reasons.${reason}` as never);
}

function ReasonPicker({
  form,
  reasons,
  direction,
}: {
  form: UseFormReturn<EntryFormValues>;
  reasons: string[];
  direction: "IN" | "OUT";
}) {
  const t = useTranslations();
  const message = useMessage();
  const value = useWatch({ control: form.control, name: "reason" });
  const error = form.formState.errors.reason?.message;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{t("entryForm.reason")}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {reasons.map((r) => {
          const helpKey = r === "CORRECTION" ? `CORRECTION_${direction}` : r;
          const selected = value === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => form.setValue("reason", r, { shouldValidate: true })}
              className={cn(
                "flex min-h-20 flex-col items-start gap-1 rounded-lg border p-3 text-start transition-colors",
                selected ? "border-primary bg-primary/5 ring-2 ring-primary" : "hover:bg-accent",
              )}
            >
              <span className="text-sm font-semibold">{reasonLabel(t, r, direction)}</span>
              <span className="text-xs text-muted-foreground">{t(`reasonHelp.${helpKey}` as never)}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm text-destructive">{message(error)}</p>}
    </fieldset>
  );
}

function ConditionPicker({ form }: { form: UseFormReturn<EntryFormValues> }) {
  const t = useTranslations("entryForm");
  const message = useMessage();
  const value = useWatch({ control: form.control, name: "returnCondition" });
  const error = form.formState.errors.returnCondition?.message;
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{t("returnCondition")}</legend>
      <div className="grid grid-cols-2 gap-2">
        {(["RESELLABLE", "DAMAGED"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            onClick={() => form.setValue("returnCondition", c, { shouldValidate: true })}
            className={cn(
              "flex min-h-16 flex-col items-start gap-1 rounded-lg border p-3 text-start",
              value === c ? "border-primary bg-primary/5 ring-2 ring-primary" : "hover:bg-accent",
            )}
          >
            <span className="text-sm font-semibold">{t(c)}</span>
            <span className="text-xs text-muted-foreground">{t(`${c}Help`)}</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-sm text-destructive">{message(error)}</p>}
    </fieldset>
  );
}

function LinesEditor({
  form,
  data,
  stock,
  warehouseName,
  disabled,
}: {
  form: UseFormReturn<EntryFormValues>;
  data: EntryFormData;
  stock?: Record<string, number>;
  warehouseName: string;
  disabled: boolean;
}) {
  const t = useTranslations("entryForm");
  const locale = useLocale();
  const message = useMessage();
  const { fields, append, update, remove } = useFieldArray({ control: form.control, name: "lines" });
  const lines = useWatch({ control: form.control, name: "lines" }) ?? [];
  const byId = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);
  const linesError = form.formState.errors.lines;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("products")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.length === 0 && <p className="text-sm text-muted-foreground">{t("noProducts")}</p>}
        <ul className="space-y-3">
          {fields.map((field, i) => {
            const product = byId.get(lines[i]?.productId ?? field.productId);
            if (!product) return null;
            const qty = Number(normalizeNumberText(lines[i]?.quantity ?? "")) || 0;
            const available = stock ? (stock[product.id] ?? 0) : undefined;
            const over = available !== undefined && qty > available;
            const qtyError = linesError?.[i]?.quantity?.message;
            return (
              <li key={field.id} className="rounded-md border p-3">
                <div className="flex items-start gap-3">
                  <ProductThumb src={product.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <Ltr className="block font-medium">{product.modelCode}</Ltr>
                    <span className="block text-sm text-muted-foreground">{locale === "ar" ? product.nameAr : product.nameEn}</span>
                    {available !== undefined && (
                      <span className="text-xs text-muted-foreground">{t("available", { count: available })}</span>
                    )}
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="size-10" aria-label={t("remove")} onClick={() => remove(i)}>
                    <Trash2Icon className="size-4" aria-hidden />
                  </Button>
                </div>
                <div className="mt-2 flex justify-end">
                  <QuantityStepper
                    label={t("quantity", { modelCode: product.modelCode })}
                    value={lines[i]?.quantity ?? ""}
                    invalid={over || Boolean(qtyError)}
                    onChange={(v) => update(i, { productId: product.id, quantity: v })}
                  />
                </div>
                {over && (
                  <p role="alert" className="mt-1 text-sm text-destructive">
                    {t("onlyLeft", { available: available ?? 0, modelCode: product.modelCode, warehouse: warehouseName })}
                  </p>
                )}
                {qtyError && <p className="mt-1 text-sm text-destructive">{message(qtyError)}</p>}
              </li>
            );
          })}
        </ul>
        {typeof linesError?.message === "string" && <p className="text-sm text-destructive">{message(linesError.message)}</p>}
        <ProductPicker
          products={data.products.filter((p) => !lines.some((l) => l.productId === p.id))}
          available={stock}
          disabled={disabled}
          onPick={(p) => append({ productId: p.id, quantity: "1" })}
        />
      </CardContent>
    </Card>
  );
}

function Summary({
  values,
  data,
  productById,
}: {
  values: EntryFormValues;
  data: EntryFormData;
  productById: Map<string, EntryFormData["products"][number]>;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const wh = (id: string) => data.warehouses.find((w) => w.id === id)?.name ?? "—";
  const units = values.lines.reduce((s, l) => s + (Number(normalizeNumberText(l.quantity)) || 0), 0);
  const rows: [string, React.ReactNode][] = [
    [t("entryForm.reason"), reasonLabel(t, values.reason, data.direction)],
    [values.reason === "TRANSFER" ? t("entryForm.fromWarehouse") : t("entryForm.warehouse"), wh(values.warehouseId)],
  ];
  if (values.reason === "TRANSFER") rows.push([t("entryForm.toWarehouse"), wh(values.destinationWarehouseId)]);
  if (values.reason === "CUSTOMER_RETURN" && values.returnCondition)
    rows.push([t("entryForm.returnCondition"), t(`entryForm.${values.returnCondition}`)]);
  for (const { field } of fieldsFor(values.reason as EntryReason)) {
    if (!(field in DETAIL_LABEL)) continue;
    const v = values[field as keyof EntryFormValues] as string;
    if (!v) continue;
    const shown = field === "reference" || field === "customerPhone" ? <Ltr key={field}>{v}</Ltr> : <bdi key={field}>{v}</bdi>;
    rows.push([t(`entryForm.${field === "reference" ? referenceLabel(values.reason) : field}` as never), shown]);
  }
  if (values.note) rows.push([t("entryForm.note"), values.note]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("entryForm.summaryTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {values.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- private, auth-protected route
          <img src={values.photoUrl} alt={t("photo.label")} className="h-28 rounded-md border object-cover" />
        )}
        <ul className="divide-y rounded-md border">
          {values.lines.map((l) => {
            const p = productById.get(l.productId);
            return (
              <li key={l.productId} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <Ltr className="block font-medium">{p?.modelCode}</Ltr>
                  <span className="block truncate text-sm text-muted-foreground">{locale === "ar" ? p?.nameAr : p?.nameEn}</span>
                </div>
                <span className="text-lg font-semibold tabular-nums">× {normalizeNumberText(l.quantity)}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted-foreground">{t("entryForm.totals", { lines: values.lines.length, units })}</p>
      </CardContent>
    </Card>
  );
}

function DoneStep({
  saved,
  direction,
  reason,
  onNew,
  onRepeat,
}: {
  saved: SavedEntry;
  direction: "IN" | "OUT";
  reason: EntryReason;
  onNew: () => void;
  onRepeat: () => void;
}) {
  const t = useTranslations("entryForm");
  const printable = direction === "OUT" && reason !== "CORRECTION";
  return (
    <Card className="mx-auto max-w-md text-center">
      <CardContent className="space-y-5 pt-8 pb-8">
        <CheckCircle2Icon className="mx-auto size-14 text-green-600" aria-hidden />
        <div>
          <p className="text-muted-foreground">{t("savedAs")}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight" dir="ltr">
            {saved.number}
          </p>
          {saved.linked && (
            <p className="mt-1 text-lg font-semibold text-muted-foreground" dir="ltr">
              {saved.linked.number}
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Button className="h-12 text-base" onClick={onNew}>
            {t("newEntry")}
          </Button>
          <Button variant="outline" className="h-12 text-base" onClick={onRepeat}>
            {t("repeat")}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" className="h-11" asChild>
              <Link href={`/entries/${saved.id}`}>{t("viewEntry")}</Link>
            </Button>
            {printable && (
              <Button variant="ghost" className="h-11" asChild>
                <Link href={`/print/entries/${saved.id}`} target="_blank">
                  <PrinterIcon className="size-4" aria-hidden />
                  {t("printNote")}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
