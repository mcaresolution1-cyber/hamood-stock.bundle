"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Friendly, translated error screen. Shows only the error digest (a reference), never the message. */
export function ErrorView({ error, retry }: { error: Error & { digest?: string }; retry?: () => void }) {
  const t = useTranslations("states");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <TriangleAlertIcon className="size-10 text-amber-600" aria-hidden />
      <h1 className="text-xl font-semibold">{t("errorTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("errorBody")}</p>
      {error.digest && (
        <p className="text-xs text-muted-foreground">
          {t("errorReference")} <span dir="ltr" className="font-mono">{error.digest}</span>
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {retry && <Button onClick={() => retry()}>{t("retry")}</Button>}
        <Button variant="outline" asChild>
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
    </div>
  );
}
