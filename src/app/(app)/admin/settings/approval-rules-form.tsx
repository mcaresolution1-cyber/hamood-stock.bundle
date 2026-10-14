"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { TextField, applyActionErrors } from "@/components/form-fields";
import { useMessage } from "@/components/use-message";
import { APPROVAL_RULES, approvalRulesFormSchema, type ApprovalRules, type ApprovalRulesFormValues } from "@/lib/settings";
import { saveApprovalRulesAction } from "@/server/actions/settings";
import { runAction } from "@/lib/run-action";

export function ApprovalRulesForm({ initial }: { initial: ApprovalRulesFormValues }) {
  const t = useTranslations();
  const message = useMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<ApprovalRulesFormValues, unknown, ApprovalRules>({
    resolver: zodResolver(approvalRulesFormSchema),
    defaultValues: initial,
  });

  function onSubmit() {
    // Send the raw text (the server parses it with the same schema), not the parsed numbers (see H10).
    const values = form.getValues();
    startTransition(async () => {
      const result = await runAction(() => saveApprovalRulesAction(values), { retry: true }); // same values twice = same result
      if (result.ok) {
        toast.success(t("settings.saved"));
        router.refresh();
      } else {
        const formError = applyActionErrors(form, result);
        if (formError) toast.error(message(formError, result.params));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.approvalsTitle")}</CardTitle>
        <CardDescription>{t("settings.approvalsHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
            {APPROVAL_RULES.map((rule) => (
              <fieldset key={rule} className="grid gap-3 border-t pt-4 first:border-t-0 first:pt-0 sm:grid-cols-[10rem_1fr_1fr] sm:items-start">
                <legend className="contents">
                  <span className="pt-2 font-medium sm:pt-8">{t(`approvals.rules.${rule}`)}</span>
                </legend>
                <TextField name={`${rule}.maxUnits`} label={t("settings.maxUnits")} inputMode="numeric" dir="ltr" />
                <TextField name={`${rule}.maxValue`} label={t("settings.maxValue")} inputMode="decimal" dir="ltr" optional />
              </fieldset>
            ))}
            <p className="text-sm text-muted-foreground">{t("settings.maxValueHint")}</p>
            <Button type="submit" disabled={pending}>
              {pending ? t("common.saving") : t("common.save")}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
