import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Locale + messages are resolved per request in src/i18n/request.ts (cookie based, no URL prefix).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Keep this a plain object (not a function): Hostinger's Next.js build patches it.
const nextConfig: NextConfig = {
  // Hostinger runs Next.js as a standalone server (.next/standalone/server.js) and forces this setting
  // anyway; setting it here makes local builds identical to Hostinger's. `pnpm start` runs the same server.
  output: "standalone",
  // Cache Components is off on purpose: every page in this app is per-user and
  // per-locale (session + locale cookies), and Auth.js / next-intl are used in their
  // standard request-time mode. Revisit if we ever add public, cacheable pages.
  cacheComponents: false,
  // Don't log server-action arguments in dev: the login action receives the password.
  logging: { serverFunctions: false },
  experimental: {
    // Imports (≤ 2 MB) and delivery-note photos (≤ 4 MB) go through server actions.
    // Photos are capped at 4 MB (decision Q10, MEDIUMBLOB); keep the body limit just above that.
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
