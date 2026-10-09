/**
 * Auth.js config shared by the proxy (src/proxy.ts) and the full server config (src/auth.ts).
 * Keep this file free of database / bcrypt imports.
 */
import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 }, // 12 hours — a working day
  providers: [], // added in src/auth.ts
  callbacks: {
    /** Optimistic redirect check used by the proxy. Real authorization happens in the DAL. */
    authorized({ auth, request }) {
      // /login is always reachable. The login page itself redirects to / when the user is
      // valid in the database — doing it here would loop for a deactivated user whose
      // cookie is still valid (proxy sends them to /, the DAL sends them back to /login).
      if (request.nextUrl.pathname === "/login") return true;
      return Boolean(auth?.user); // false → redirect to pages.signIn
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      // Only the id is trusted server-side; role etc. are re-read from the DB by the DAL.
      if (typeof token.id === "string") session.user.id = token.id;
      if (typeof token.role === "string") session.user.role = token.role as Role;
      return session;
    },
  },
} satisfies NextAuthConfig;
