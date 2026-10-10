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
import { SelectField, TextField, applyActionErrors } from "@/components/form-fields";
import { useMessage } from "@/components/use-message";
import { warehouseSchema, type WarehouseFormValues, type WarehouseInput } from "@/lib/validation/warehouses";
import { createWarehouse, updateWarehouse } from "@/server/actions/warehouses";

type Existing = { id: string } & WarehouseFormValues;

export function WarehouseDialog({ warehouse }: { warehouse?: Existing }) {
  const t = useTranslations();
  const message = useMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<WarehouseFormValues, unknown, WarehouseInput>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: warehouse ?? { name: "", city: "", kind: "SELLABLE" },
  });

  function onSubmit(values: WarehouseInput) {
    startTransition(async () => {
      const result = warehouse ? await updateWarehouse(warehouse.id, values) : await createWarehouse(values);
      if (result.ok) {
        toast.success(t("common.saved"));
        setOpen(false);
        if (!warehouse) form.reset();
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
        {warehouse ? (
          <Button variant="ghost" size="sm">
            {t("common.edit")}
          </Button>
        ) : (
          <Button>
            <PlusIcon className="size-4" aria-hidden />
            {t("warehouses.new")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{warehouse ? t("warehouses.editTitle") : t("warehouses.new")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <TextField name="name" label={t("warehouses.name")} autoFocus />
            <TextField name="city" label={t("warehouses.city")} />
            <SelectField
              name="kind"
              label={t("warehouses.kind")}
              options={(["SELLABLE", "DAMAGED"] as const).map((k) => ({ value: k, label: t(`warehouseKinds.${k}`) }))}
            />
            <DialogFooter>
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
