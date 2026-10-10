import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

export default getRequestConfig(async ({ locale: requested }) => {
  // An explicit locale (e.g. getTranslations({ locale: "ar" }) on the bilingual delivery note) wins;
  // otherwise use the user's chosen language from the cookie.
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requested) ? requested : isLocale(fromCookie) ? fromCookie : defaultLocale;

  return {
    locale,
    timeZone: "Asia/Riyadh",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
