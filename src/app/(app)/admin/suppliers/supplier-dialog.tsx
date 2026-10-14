"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TextField, applyActionErrors } from "@/components/form-fields";
import { useMessage } from "@/components/use-message";
import { EMPTY_SUPPLIER, supplierSchema, type SupplierFormValues, type SupplierInput } from "@/lib/validation/suppliers";
import { createSupplier, updateSupplier } from "@/server/actions/suppliers";
import { runAction } from "@/lib/run-action";
import type { ActionResult } from "@/server/actions/result";

export function SupplierDialog({ supplier }: { supplier?: { id: string } & SupplierFormValues }) {
  const t = useTranslations();
  const message = useMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<SupplierFormValues, unknown, SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: supplier ?? EMPTY_SUPPLIER,
  });

  function onSubmit() {
    const values = form.getValues(); // raw text: the server parses it with the same schema
    startTransition(async () => {
      const result = await runAction<ActionResult<unknown>>(() => (supplier ? updateSupplier(supplier.id, values) : createSupplier(values)), {
        retry: Boolean(supplier),
      });
      if (result.ok) {
        toast.success(t("common.saved"));
        setOpen(false);
        if (!supplier) form.reset(EMPTY_SUPPLIER);
        router.refresh();
      } else {
        const formError = applyActionErrors(form, result);
        if (formError) toast.error(message(formError, result.params));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {supplier ? (
          <Button variant="ghost" size="sm">
            {t("common.edit")}
          </Button>
        ) : (
          <Button>
            <PlusIcon className="size-4" aria-hidden />
            {t("suppliers.new")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{supplier ? t("suppliers.editTitle") : t("suppliers.new")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
            <TextField name="nameEn" label={t("suppliers.nameEn")} dir="ltr" autoFocus={!supplier} />
            <TextField name="nameAr" label={t("suppliers.nameAr")} dir="rtl" lang="ar" optional />
            <TextField name="contactPerson" label={t("suppliers.contactPerson")} optional />
            <TextField name="phone" label={t("suppliers.phone")} inputMode="tel" dir="ltr" optional />
            <TextField name="email" type="email" label={t("suppliers.email")} dir="ltr" optional />
            <TextField name="vatNumber" label={t("suppliers.vatNumber")} dir="ltr" inputMode="numeric" optional />
            <TextField name="city" label={t("suppliers.city")} optional />
            <TextField name="country" label={t("suppliers.country")} optional />
            <div className="sm:col-span-2">
              <TextField name="paymentTerms" label={t("suppliers.paymentTerms")} optional />
            </div>
            <div className="sm:col-span-2">
              <TextField name="notes" label={t("suppliers.notes")} optional />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
