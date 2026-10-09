/**
 * Optimistic auth redirect only (logged-out → /login, logged-in on /login → /).
 * It is NOT the security boundary: every page, server action and route handler
 * re-checks the user through src/server/auth/dal.ts.
 */
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Everything except Auth.js endpoints, Next internals and static files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
