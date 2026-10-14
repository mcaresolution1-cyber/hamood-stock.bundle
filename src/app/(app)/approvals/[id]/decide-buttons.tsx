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
import { decideRequestAction } from "@/server/actions/approvals";
import { runAction } from "@/lib/run-action";

/** Approve / Reject for an approver. The server re-checks scope, status and "not your own request". */
export function DecideButtons({ requestId, number }: { requestId: string; number: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex">
      <DecideDialog requestId={requestId} number={number} approve />
      <DecideDialog requestId={requestId} number={number} approve={false} />
    </div>
  );
}

function DecideDialog({ requestId, number, approve }: { requestId: string; number: string; approve: boolean }) {
  const t = useTranslations("approvals");
  const tc = useTranslations("common");
  const message = useMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tooShort = !approve && note.trim().length < 3;

  function submit() {
    setError(null);
    startTransition(async () => {
      // Retried on a network error: a repeat finds the request already decided and says so.
      const result = await runAction(() => decideRequestAction({ requestId, approve, note }), { retry: true });
      if (result.ok) {
        toast.success(approve ? t("approved", { number }) : t("rejected"));
        setOpen(false);
        router.refresh();
      } else {
        setError(message(result.fieldErrors?.note ?? result.error, result.params));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={approve ? "default" : "outline"} className="h-12 sm:h-10">
          {approve ? t("approve") : t("reject")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{approve ? t("approveTitle", { number }) : t("rejectTitle", { number })}</DialogTitle>
          <DialogDescription>{approve ? t("approveHint") : t("rejectHint")}</DialogDescription>
        </DialogHeader>
        <label className="grid gap-2 text-sm font-medium">
          {approve ? t("noteOptional") : t("noteRequired")}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
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
          <Button variant={approve ? "default" : "destructive"} onClick={submit} disabled={pending || tooShort}>
            {pending ? tc("saving") : approve ? t("approve") : t("reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
