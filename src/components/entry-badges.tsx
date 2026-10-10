import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { EntryType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const TONE: Record<EntryType, string> = {
  IN: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  TRANSFER_IN: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  CORRECTION_IN: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  OUT: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  TRANSFER_OUT: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  CORRECTION_OUT: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  VOID: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
};

/** Entry type as a coloured badge (green = in, amber = out, blue = correction, grey = void). */
export async function EntryTypeBadge({ type, voided }: { type: EntryType; voided?: boolean }) {
  const t = await getTranslations();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant="secondary" className={cn("border-transparent", TONE[type])}>
        {t(`entryTypes.${type}`)}
      </Badge>
      {voided && <Badge variant="destructive">{t("entries.voided")}</Badge>}
    </span>
  );
}
