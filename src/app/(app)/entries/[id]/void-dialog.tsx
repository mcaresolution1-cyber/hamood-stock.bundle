"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useMessage } from "@/components/use-message";
import { voidEntryAction } from "@/server/actions/entries";
import { runAction } from "@/lib/run-action";
import { newSubmitKey } from "@/lib/submit-key";

/** ADMIN / MANAGER: confirm + required reason. Above the approval limit it becomes a request. The server re-checks everything. */
export function VoidDialog({
  entryId,
  number,
  isTransfer,
  isTrashedPair = false,
}: {
  entryId: string;
  number: string;
  isTransfer: boolean;
  /** A trashed return or its write-off: both are voided together. */
  isTrashedPair?: boolean;
}) {
  const t = useTranslations("void");
  const tc = useTranslations("common");
  const message = useMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // One key per opened dialog: a retried submit returns the request already saved.
  const [submitKey, setSubmitKey] = useState(newSubmitKey);

  function onOpenChange(next: boolean) {
    if (next) setSubmitKey(newSubmitKey());
    setOpen(next);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await runAction(() => voidEntryAction({ entryId, reason, idempotencyKey: submitKey }));
      if (result.ok) {
        if (result.data.status === "pending") {
          toast.success(t("sentForApproval", { number: result.data.request.number }));
        } else {
          toast.success(t("done", { numbers: result.data.result.voids.map((v) => v.number).join(", ") }));
        }
        setOpen(false);
        router.refresh();
      } else {
        setError(message(result.fieldErrors?.reason ?? result.error, result.params));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive">{t("button")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { number })}</DialogTitle>
          <DialogDescription>
            {t("description")}
            {isTransfer && <> {t("transferNote")}</>}
            {isTrashedPair && <> {t("trashedNote")}</>}
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-2 text-sm font-medium">
          {t("reason")}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPlaceholder")}
            rows={3}
            maxLength={500}
            className="rounded-md border border-input bg-transparent p-3 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-invalid={Boolean(error)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{tc("cancel")}</Button>
          </DialogClose>
          <Button variant="destructive" onClick={submit} disabled={pending || reason.trim().length < 3}>
            {pending ? t("voiding") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
