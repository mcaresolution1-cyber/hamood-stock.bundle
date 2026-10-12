#!/usr/bin/env node
/**
 * Make Next's WASM compiler available WITHOUT a download, before `next build`.
 *
 * Why: Hostinger's build server has glibc < 2.29, so Next's native compiler (@next/swc-linux-x64-gnu,
 * needs GLIBC_2.30) can't load there. Next then falls back to WASM, but it only looks for it in
 * <next>/wasm/@next/swc-wasm-nodejs and otherwise DOWNLOADS it — which fails on Hostinger (the registry
 * lookup runs the package manager, which hits a corepack/pnpm version mismatch). It never uses the
 * package installed in node_modules. So we copy our installed @next/swc-wasm-nodejs (a devDependency,
 * same version as next) to exactly where Next's download would put it; Next then skips the download.
 *
 * Harmless where the native compiler works (Next loads native first and never looks here).
 * Verified by building with the native binary hidden and the registry unreachable.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));

const nextDir = path.dirname(require.resolve("next/package.json"));
const nextVersion = require("next/package.json").version;
let wasmPkgDir;
try {
  wasmPkgDir = path.dirname(require.resolve("@next/swc-wasm-nodejs/package.json"));
} catch {
  console.warn("[prepare-wasm-swc] @next/swc-wasm-nodejs is not installed — skipping (native compiler must work)");
  process.exit(0);
}
const wasmVersion = JSON.parse(fs.readFileSync(path.join(wasmPkgDir, "package.json"), "utf8")).version;
if (wasmVersion !== nextVersion) {
  console.error(`[prepare-wasm-swc] @next/swc-wasm-nodejs ${wasmVersion} must match next ${nextVersion} — update it in package.json`);
  process.exit(1);
}

const target = path.join(nextDir, "wasm", "@next", "swc-wasm-nodejs");
if (fs.existsSync(path.join(target, "wasm.js"))) {
  console.log("[prepare-wasm-swc] already in place");
} else {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(wasmPkgDir, target, { recursive: true, dereference: true });
  console.log(`[prepare-wasm-swc] copied @next/swc-wasm-nodejs ${wasmVersion} → ${path.relative(ROOT, target)}`);
}
