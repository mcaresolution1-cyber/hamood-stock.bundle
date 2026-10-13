"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CopyIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Friendly, translated error screen. Never shows the error message itself; shows a reference
 * (Next's digest for server errors, otherwise a random id) and the time, logs both server-side
 * (/api/client-error) and lets the user copy them for a "Report problem" message.
 */
export function ErrorView({ error, retry }: { error: Error & { digest?: string }; retry?: () => void }) {
  const t = useTranslations("states");
  const format = useFormatter();
  const [copied, setCopied] = useState(false);
  // Fixed once per error screen (a lazy initializer, not during every render).
  const [report] = useState(() => ({
    ref: error.digest ?? Math.random().toString(36).slice(2, 10).toUpperCase(),
    at: new Date(),
  }));
  const when = format.dateTime(report.at, { dateStyle: "medium", timeStyle: "medium" });

  useEffect(() => {
    console.error(error);
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: report.ref,
        digest: error.digest ?? "",
        at: report.at.toISOString(),
        path: window.location.pathname + window.location.search,
        message: `${error.name}: ${error.message}`.slice(0, 500),
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error, report]);

  async function copy() {
    const details = `${t("errorReference")} ${report.ref}\n${t("errorTime")} ${report.at.toISOString()}\n${window.location.href}`;
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <TriangleAlertIcon className="size-10 text-amber-600" aria-hidden />
      <h1 className="text-xl font-semibold">{t("errorTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("errorBody")}</p>
      <dl className="grid grid-cols-[auto_auto] gap-x-2 text-xs text-muted-foreground">
        <dt>{t("errorReference")}</dt>
        <dd dir="ltr" className="font-mono">{report.ref}</dd>
        <dt>{t("errorTime")}</dt>
        <dd>{when}</dd>
      </dl>
      <div className="flex flex-wrap justify-center gap-2">
        {retry && <Button onClick={() => retry()}>{t("retry")}</Button>}
        <Button variant="outline" asChild>
          <Link href="/">{t("home")}</Link>
        </Button>
        <Button variant="ghost" onClick={copy}>
          <CopyIcon className="size-4" aria-hidden />
          {copied ? t("copied") : t("copyDetails")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("reportHint")}</p>
    </div>
  );
}
