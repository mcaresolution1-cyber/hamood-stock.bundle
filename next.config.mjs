// @ts-check
// Plain JavaScript on purpose (not next.config.ts): Hostinger's build server can't run Next's native
// compiler, and its config patching (it forces `output: "standalone"`) breaks a TypeScript config there
// ("Cannot find module '…/<hash>.next.config'"). An .mjs config needs no compiling. See docs/plans/hostinger.md H14.
import createNextIntlPlugin from "next-intl/plugin";

// Locale + messages are resolved per request in src/i18n/request.ts (cookie based, no URL prefix).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Keep this a plain object (not a function): Hostinger's Next.js build patches it.
/** @type {import("next").NextConfig} */
const nextConfig = {
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
    // Keep a visited page in the browser for 30 s, so going back and forth between pages is instant
    // instead of a skeleton and a full server round trip each time (plan ux-dashboard-report, PX6).
    // Saving anything (server actions call revalidatePath) and a page reload still show fresh data.
    staleTimes: { dynamic: 30 },
  },
};

export default withNextIntl(nextConfig);
