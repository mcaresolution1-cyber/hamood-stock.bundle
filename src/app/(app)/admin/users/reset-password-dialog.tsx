"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TextField, applyActionErrors } from "@/components/form-fields";
import { useMessage } from "@/components/use-message";
import { resetPasswordSchema } from "@/lib/validation/users";
import { resetUserPassword } from "@/server/actions/users";

export function ResetPasswordDialog({ id, name }: { id: string; name: string }) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const message = useMessage();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<{ password: string }>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "" },
  });

  function onSubmit(values: { password: string }) {
    startTransition(async () => {
      const result = await resetUserPassword(id, values);
      if (result.ok) {
        toast.success(t("resetDone", { name }));
        setOpen(false);
        form.reset();
      } else {
        const formError = applyActionErrors(form, result);
        if (formError) toast.error(message(formError, result.params));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {t("resetPassword")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("resetTitle", { name })}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <TextField name="password" type="password" dir="ltr" autoComplete="new-password" label={t("newPassword")} autoFocus />
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? tc("saving") : tc("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
