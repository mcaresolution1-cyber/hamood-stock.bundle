/**
 * Vitest globalSetup for the "integration" project: make sure the test database exists and has all
 * migrations applied (via the WASM engine, so it works with or without the native Prisma engine).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { testDatabaseUrl } from "./test-db-url";

export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const dbName = decodeURIComponent(url.pathname.slice(1));

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (e) {
    throw new Error(
      `Integration tests need PostgreSQL at ${url.host} (${(e as Error).message}). ` +
        "Start it with: bash scripts/cloud-setup.sh — or run only unit tests: pnpm test:unit",
    );
  }
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (!rowCount) await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  await client.end();

  execFileSync(process.execPath, ["--no-warnings", path.resolve("scripts/prisma-wasm.mjs"), "deploy"], {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: ["ignore", "ignore", "inherit"],
  });
}
