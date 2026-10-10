import { getTranslations } from "next-intl/server";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** One-line description of the report + the Excel download (same filters as the screen). */
export async function ReportBar({ hint, exportHref }: { hint: string; exportHref: string }) {
  const t = await getTranslations("reports");
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">{hint}</p>
      <Button variant="outline" asChild className="h-10">
        <a href={exportHref} download>
          <DownloadIcon className="size-4" aria-hidden />
          {t("export")}
        </a>
      </Button>
    </div>
  );
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
