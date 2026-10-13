"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { loginAction } from "@/server/actions/auth";
import { runAction } from "@/lib/run-action";
import { useMessage } from "@/components/use-message";

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const message = useMessage();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: LoginInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await runAction(() => loginAction(values), { retry: true });
      if (result.ok) {
        router.replace("/");
        router.refresh();
      } else {
        // Connection problems come back as global keys ("errors.network"); login's own errors are short keys.
        setFormError(result.error.includes(".") ? message(result.error, "params" in result ? result.params : undefined) : t(`errors.${result.error as "generic"}`));
        form.resetField("password");
      }
    });
  }

  // Zod messages are translation keys under auth.errors
  const errorText = (key?: string) => (key ? t(`errors.${key as "generic"}`) : undefined);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>{t("email")}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  dir="ltr"
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage>{errorText(fieldState.error?.message)}</FormMessage>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>{t("password")}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" dir="ltr" {...field} />
              </FormControl>
              <FormMessage>{errorText(fieldState.error?.message)}</FormMessage>
            </FormItem>
          )}
        />

        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </form>
    </Form>
  );
}
