#!/usr/bin/env node
/**
 * After `next build` (output: "standalone"): copy the static assets next to the standalone server, the
 * way `next build` documents, so `.next/standalone` runs on its own (`pnpm start`, Hostinger).
 * Harmless if the host copies them again.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(ROOT, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("[standalone-assets] .next/standalone/server.js not found — is output: 'standalone' set?");
  process.exit(1);
}
const copy = (from, to) => {
  if (!fs.existsSync(from)) return;
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`[standalone-assets] ${path.relative(ROOT, from)} → ${path.relative(ROOT, to)}`);
};
copy(path.join(ROOT, ".next", "static"), path.join(standalone, ".next", "static"));
copy(path.join(ROOT, "public"), path.join(standalone, "public"));
