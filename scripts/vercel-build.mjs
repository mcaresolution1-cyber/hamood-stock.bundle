#!/usr/bin/env node
/**
 * Vercel build (`vercel-build` script — Vercel runs it instead of `build`).
 * Applies pending migrations, then builds. Migrations run only when BOTH:
 *   - DIRECT_URL is set for this environment, and
 *   - this is a Production deployment (VERCEL_ENV=production), or the environment opts in with
 *     MIGRATE_ON_BUILD=1 (only for a Preview that has its OWN database, e.g. a Neon branch).
 * So a Preview build never migrates the production database, even if DIRECT_URL was saved for every
 * environment by mistake. See README "Deploy".
 */
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const env = process.env.VERCEL_ENV ?? "unknown";
const allowed = env === "production" || process.env.MIGRATE_ON_BUILD === "1";

if (process.env.DIRECT_URL && allowed) {
  run("prisma migrate deploy");
} else {
  console.log(`vercel-build: skipping migrations (VERCEL_ENV=${env}, DIRECT_URL ${process.env.DIRECT_URL ? "set" : "not set"})`);
}
run("next build");
