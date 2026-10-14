"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ltr } from "@/components/ltr";
import { useMessage } from "@/components/use-message";
import { runAction } from "@/lib/run-action";
import { setLineCosts } from "@/server/actions/entry-details";

type Line = { id: string; modelCode: string; quantity: number; unitCost: string | null; enteredBy: string | null };

/** Fill in / correct the unit costs of a supplier delivery (ADMIN, MANAGER of the warehouse). */
export function LineCostsForm({ entryId, lines, editable }: { entryId: string; lines: Line[]; editable: boolean }) {
  const t = useTranslations("entries");
  const tc = useTranslations("common");
  const message = useMessage();
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(lines.map((l) => [l.id, l.unitCost ?? ""])));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const costs = lines.filter((l) => values[l.id] !== (l.unitCost ?? "")).map((l) => ({ lineId: l.id, unitCost: values[l.id] }));
      if (!costs.length) return;
      const result = await runAction(() => setLineCosts({ entryId, costs }), { retry: true }); // same values twice = no change
      if (result.ok) {
        toast.success(t("costsSaved"));
        router.refresh();
      } else toast.error(message(result.fieldErrors ? "validation.money" : result.error, result.params));
    });
  }

  return (
    <div className="space-y-3">
      {editable && <p className="text-sm text-muted-foreground">{t("costsHint")}</p>}
      <ul className="divide-y rounded-md border">
        {lines.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="min-w-0">
              <Ltr className="font-medium">{l.modelCode}</Ltr>
              <span className="ms-2 text-sm text-muted-foreground">× {l.quantity}</span>
              {l.enteredBy && <span className="block text-xs text-muted-foreground">{t("enteredBy", { name: l.enteredBy })}</span>}
            </span>
            {editable ? (
              <Input
                aria-label={`${t("costs")} ${l.modelCode}`}
                value={values[l.id]}
                onChange={(e) => setValues((v) => ({ ...v, [l.id]: e.target.value }))}
                inputMode="decimal"
                dir="ltr"
                className="h-11 w-32 md:h-10"
                placeholder="0.00"
              />
            ) : (
              <Ltr className="tabular-nums">{l.unitCost ?? "—"}</Ltr>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <Button onClick={save} disabled={pending}>
          {pending ? tc("saving") : t("saveCosts")}
        </Button>
      )}
    </div>
  );
}
