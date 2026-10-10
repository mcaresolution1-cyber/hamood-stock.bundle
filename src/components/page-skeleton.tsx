import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder shown while a page loads: a title, a toolbar and a few rows. */
export async function PageSkeleton({ header = true, rows = 6 }: { header?: boolean; rows?: number }) {
  const t = await getTranslations("common");
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{t("loading")}</span>
      {header && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      )}
      <Skeleton className="h-10 w-full" />
      <div className="space-y-2 rounded-lg border p-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
