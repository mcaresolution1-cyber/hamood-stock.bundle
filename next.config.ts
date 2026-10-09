import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Locale + messages are resolved per request in src/i18n/request.ts (cookie based, no URL prefix).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: every page in this app is per-user and
  // per-locale (session + locale cookies), and Auth.js / next-intl are used in their
  // standard request-time mode. Revisit if we ever add public, cacheable pages.
  cacheComponents: false,
  // Don't log server-action arguments in dev: the login action receives the password.
  logging: { serverFunctions: false },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
