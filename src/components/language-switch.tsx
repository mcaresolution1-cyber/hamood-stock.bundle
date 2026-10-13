"use client";

import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { locales } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * EN | AR switch (segmented from md up; a single "other language" link on phones).
 * Plain links to /locale (src/app/locale/route.ts), which sets the cookie and redirects back — no server
 * action, so it can't fail with "Failed to fetch" on a cold start or after a redeploy.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const t = useTranslations();
  const current = useLocale();
  const pathname = usePathname();

  const hrefFor = (locale: string, next: string) => `/locale?l=${locale}&next=${encodeURIComponent(next)}`;

  return (
    <div
      role="group"
      aria-label={t("topBar.language")}
      className={cn("inline-flex rounded-md border text-xs font-medium md:p-0.5", className)}
    >
      {locales.map((locale) => {
        const active = locale === current;
        const classes = cn(
          "inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm px-2.5 uppercase transition-colors md:min-h-0 md:min-w-0 md:py-1",
          // Phones show only the other language (one 44px target); md+ shows both as a segmented switch.
          active ? "bg-primary text-primary-foreground max-md:hidden" : "text-muted-foreground hover:text-foreground",
        );
        const label = locale === "ar" ? "عربي" : "EN";
        return active ? (
          <span key={locale} lang={locale} aria-current="true" title={t(`language.${locale}`)} className={classes}>
            {label}
          </span>
        ) : (
          <a
            key={locale}
            lang={locale}
            hrefLang={locale}
            href={hrefFor(locale, pathname)}
            // Keep the query string too (filters, page) — read at click time, not during render.
            onClick={(e) => {
              e.currentTarget.href = hrefFor(locale, `${window.location.pathname}${window.location.search}`);
            }}
            title={t(`language.${locale}`)}
            className={classes}
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}
