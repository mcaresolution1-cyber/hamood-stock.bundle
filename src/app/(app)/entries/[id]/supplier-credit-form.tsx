"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMessage } from "@/components/use-message";
import { runAction } from "@/lib/run-action";
import { setSupplierReturnCredit } from "@/server/actions/entry-details";

/** Return to supplier: record that the credit arrived (or undo it). */
export function SupplierCreditForm({ entryId, status }: { entryId: string; status: "SENT" | "CREDIT_RECEIVED" }) {
  const t = useTranslations("entries");
  const tc = useTranslations("common");
  const message = useMessage();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();

  function run(next: "SENT" | "CREDIT_RECEIVED") {
    startTransition(async () => {
      const result = await runAction(() => setSupplierReturnCredit({ entryId, status: next, creditAmount: amount }), { retry: true });
      if (result.ok) {
        toast.success(t("creditSaved"));
        router.refresh();
      } else toast.error(message(result.error, result.params));
    });
  }

  if (status === "CREDIT_RECEIVED") {
    return (
      <Button variant="outline" size="sm" onClick={() => run("SENT")} disabled={pending}>
        {t("markSent")}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm">
        {t("creditAmount")}
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" className="h-11 w-36 md:h-10" />
      </label>
      <Button onClick={() => run("CREDIT_RECEIVED")} disabled={pending || !amount.trim()}>
        {pending ? tc("saving") : t("markCredit")}
      </Button>
    </div>
  );
}
