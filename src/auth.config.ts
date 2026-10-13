/**
 * Auth.js config shared by the proxy (src/proxy.ts) and the full server config (src/auth.ts).
 * Keep this file free of database / bcrypt imports.
 */
import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

export const SESSION_IDLE_SECONDS = 8 * 60 * 60;
export const SESSION_ABSOLUTE_MS = 24 * 60 * 60 * 1000;

export const authConfig = {
  pages: { signIn: "/login" },
  // Idle timeout: the proxy re-signs the cookie on every request, so a session ends after 8 hours
  // without activity. The 24-hour absolute limit and "signed out by a password change" are checked
  // in the DAL (src/server/auth/dal.ts) from `authAt`.
  session: { strategy: "jwt", maxAge: SESSION_IDLE_SECONDS },
  providers: [], // added in src/auth.ts
  callbacks: {
    /** Optimistic redirect check used by the proxy. Real authorization happens in the DAL. */
    authorized({ auth, request }) {
      // /login is always reachable. The login page itself redirects to / when the user is
      // valid in the database — doing it here would loop for a deactivated user whose
      // cookie is still valid (proxy sends them to /, the DAL sends them back to /login).
      if (request.nextUrl.pathname === "/login") return true;
      // Language switch (src/app/locale/route.ts): used on the login page too.
      if (request.nextUrl.pathname === "/locale") return true;
      // Error reports from the error screen (src/app/api/client-error/route.ts), signed in or not.
      if (request.nextUrl.pathname === "/api/client-error") return true;
      return Boolean(auth?.user); // false → redirect to pages.signIn
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.authAt = Date.now(); // when this sign-in happened (never refreshed)
      }
      return token;
    },
    session({ session, token }) {
      // Only the id is trusted server-side; role etc. are re-read from the DB by the DAL.
      if (typeof token.id === "string") session.user.id = token.id;
      if (typeof token.role === "string") session.user.role = token.role as Role;
      if (typeof token.authAt === "number") session.authAt = token.authAt;
      return session;
    },
  },
} satisfies NextAuthConfig;
