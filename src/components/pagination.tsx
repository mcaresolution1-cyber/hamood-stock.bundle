import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Prev/next links that keep the other search params. */
export async function Pagination({
  page,
  pageCount,
  searchParams,
  basePath,
}: {
  page: number;
  pageCount: number;
  searchParams: Record<string, string | undefined>;
  basePath: string;
}) {
  if (pageCount <= 1) return null;
  const t = await getTranslations("common");
  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v && k !== "page") params.set(k, v);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <nav className="mt-4 flex items-center justify-between gap-2" aria-label={t("pageOf", { page, count: pageCount })}>
      <Button variant="outline" size="sm" asChild className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
        <Link href={href(page - 1)} aria-disabled={page <= 1}>
          <ChevronLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
          {t("previous")}
        </Link>
      </Button>
      <span className="text-sm text-muted-foreground">{t("pageOf", { page, count: pageCount })}</span>
      <Button variant="outline" size="sm" asChild className={page >= pageCount ? "pointer-events-none opacity-50" : ""}>
        <Link href={href(page + 1)} aria-disabled={page >= pageCount}>
          {t("next")}
          <ChevronRightIcon className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      </Button>
    </nav>
  );
}
