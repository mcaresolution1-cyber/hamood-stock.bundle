"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

/** Store the UI language in a cookie. Allowed for everyone, including logged-out users. */
// rules-allow: action-auth — the login page needs the language switch too
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
