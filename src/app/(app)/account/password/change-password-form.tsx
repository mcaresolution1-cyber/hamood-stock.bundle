"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { TextField, applyActionErrors } from "@/components/form-fields";
import { useMessage } from "@/components/use-message";
import { changePasswordSchema, type ChangePasswordValues } from "@/lib/validation/users";
import { changeOwnPassword } from "@/server/actions/account";
import { runAction } from "@/lib/run-action";

export function ChangePasswordForm({ email, mustChange }: { email: string; mustChange: boolean }) {
  const t = useTranslations("account");
  const tc = useTranslations("common");
  const message = useMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: "", password: "", confirm: "" },
  });

  function onSubmit(values: ChangePasswordValues) {
    startTransition(async () => {
      // Not retried: a second run would fail on the (already changed) current password.
      const result = await runAction(() => changeOwnPassword(values));
      if (result.ok) {
        toast.success(t("done"));
        form.reset();
        if (mustChange) router.replace("/");
        else router.refresh();
      } else {
        const formError = applyActionErrors(form, result);
        if (result.error === "account.errors.wrongCurrent") form.setError("current", { message: result.error });
        else if (formError) toast.error(message(formError, result.params));
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Lets password managers file the new password under the right account. */}
        <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
        <TextField name="current" type="password" dir="ltr" autoComplete="current-password" label={t("currentPassword")} />
        <TextField name="password" type="password" dir="ltr" autoComplete="new-password" label={t("newPassword")} />
        <TextField name="confirm" type="password" dir="ltr" autoComplete="new-password" label={t("confirmPassword")} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? tc("saving") : t("submit")}
        </Button>
      </form>
    </Form>
  );
}
