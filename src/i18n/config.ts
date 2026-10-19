export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Cookie that stores the user's chosen UI language. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Named formats shared by every page (src/i18n/request.ts). */
export const APP_FORMATS = {
  dateTime: {
    dateTime: { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", numberingSystem: "latn" },
    date: { day: "numeric", month: "short", year: "numeric", numberingSystem: "latn" },
  },
  number: {
    /** Quantities: whole units with thousands separators (17,068). */
    // Western digits in Arabic too (as on the rest of the app), whatever the browser's default.
    qty: { maximumFractionDigits: 0, numberingSystem: "latn" },
  },
} as const;
