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
  experimental: {
    // Imports (≤ 2 MB) and delivery-note photos (≤ 4 MB) go through server actions.
    // Vercel rejects request bodies over 4.5 MB, so don't raise this further (decision Q10).
    serverActions: { bodySizeLimit: "4mb" },
  },
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
