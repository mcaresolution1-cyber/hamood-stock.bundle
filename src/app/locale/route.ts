/**
 * GET /locale?l=ar&next=/admin/users — set the UI language cookie and go back.
 *
 * A plain link instead of a server action, so switching language works on every page (also with a
 * dialog open, and on a cold start or right after a redeploy, when a server-action request can fail).
 * Uses a RELATIVE Location: behind Hostinger's proxy the server's own origin is an internal address.
 */
import type { NextRequest } from "next/server";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { safeNextPath } from "@/lib/safe-next";

// rules-allow: route-auth — public on purpose: the login page needs the language switch, and it only sets a language cookie
export function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const locale = sp.get("l");
  const headers = new Headers({ Location: safeNextPath(sp.get("next")), "Cache-Control": "no-store" });
  if (isLocale(locale)) {
    headers.append(
      "Set-Cookie",
      `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https" ? "; Secure" : ""}`,
    );
  }
  return new Response(null, { status: 303, headers });
}
