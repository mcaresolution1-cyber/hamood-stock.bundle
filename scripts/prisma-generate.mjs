#!/usr/bin/env node
/**
 * `prisma generate` that also works where binaries.prisma.sh is blocked (e.g. Claude Code cloud
 * sessions). `generate` never runs the native schema engine, but the CLI still tries to download it.
 * If the normal run fails on that download, retry pointing PRISMA_SCHEMA_ENGINE_BINARY at an existing
 * file (the Node binary) so the CLI skips the download. Used by `postinstall` and `pnpm db:generate`.
 */
import { spawnSync } from "node:child_process";

function run(env) {
  return spawnSync("prisma", ["generate"], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

let result = run({});
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

if (result.status !== 0 && /binaries\.prisma\.sh|schema-engine/i.test(output)) {
  console.warn("[prisma-generate] engine download blocked — retrying without it");
  result = run({
    PRISMA_SCHEMA_ENGINE_BINARY: process.execPath,
    PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING: "1",
  });
}

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exit(result.status ?? 1);
