"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setLocaleAction } from "@/server/actions/locale";
import { locales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** EN | AR segmented switch. Stores the choice in a cookie and re-renders the page. */
export function LanguageSwitch({ className }: { className?: string }) {
  const t = useTranslations();
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: Locale) {
    if (locale === current) return;
    startTransition(async () => {
      await setLocaleAction(locale);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t("topBar.language")}
      className={cn("inline-flex rounded-md border p-0.5 text-xs font-medium", className)}
    >
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          disabled={pending}
          aria-pressed={locale === current}
          onClick={() => choose(locale)}
          title={t(`language.${locale}`)}
          className={cn(
            "rounded-sm px-2.5 py-1 uppercase transition-colors disabled:opacity-60",
            locale === current
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {locale === "ar" ? "عربي" : "EN"}
        </button>
      ))}
    </div>
  );
}
