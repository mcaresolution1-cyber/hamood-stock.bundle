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
import { categorySchema, type CategoryFormValues, type CategoryInput } from "@/lib/validation/categories";
import { createCategory, updateCategory } from "@/server/actions/categories";
import { runAction } from "@/lib/run-action";
import type { ActionResult } from "@/server/actions/result";

export function CategoryDialog({ category, nextPosition = 0 }: { category?: { id: string } & CategoryFormValues; nextPosition?: number }) {
  const t = useTranslations();
  const message = useMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const empty = { nameEn: "", nameAr: "", position: String(nextPosition) };
  const form = useForm<CategoryFormValues, unknown, CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: category ?? empty,
  });

  function onSubmit() {
    const values = form.getValues();
    startTransition(async () => {
      const result = await runAction<ActionResult<unknown>>(() => (category ? updateCategory(category.id, values) : createCategory(values)), {
        retry: Boolean(category),
      });
      if (result.ok) {
        toast.success(t("common.saved"));
        setOpen(false);
        if (!category) form.reset(empty);
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
        {category ? (
          <Button variant="ghost" size="sm">
            {t("common.edit")}
          </Button>
        ) : (
          <Button>
            <PlusIcon className="size-4" aria-hidden />
            {t("categories.new")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? t("categories.editTitle") : t("categories.new")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <TextField name="nameEn" label={t("categories.nameEn")} dir="ltr" autoFocus={!category} />
            <TextField name="nameAr" label={t("categories.nameAr")} dir="rtl" lang="ar" />
            <TextField name="position" label={t("categories.position")} hint={t("categories.positionHint")} inputMode="numeric" dir="ltr" />
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
