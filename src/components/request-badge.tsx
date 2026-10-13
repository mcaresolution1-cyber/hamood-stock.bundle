import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { ApprovalStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const TONE: Record<ApprovalStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  APPROVED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  REJECTED: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  CANCELLED: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
};

/** Approval request status as a coloured badge (the text carries the meaning, colour only helps). */
export async function RequestStatusBadge({ status }: { status: ApprovalStatus }) {
  const t = await getTranslations("approvals.status");
  return (
    <Badge variant="secondary" className={cn("border-transparent", TONE[status])}>
      {t(status)}
    </Badge>
  );
}
