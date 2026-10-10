/**
 * `pnpm db:deploy`: apply pending migrations from prisma/migrations to DATABASE_URL with the same
 * runner the server uses at start-up (src/server/db/migrator.ts). Works without Prisma's native
 * engine. Usage: pnpm db:deploy   (or DATABASE_URL=mysql://… pnpm db:deploy)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mariadb from "mariadb";
import { mariadbConfig } from "../src/lib/db-config";
import { applyMigrations, type Migration } from "../src/server/db/migrator";

export function migrationsFromDisk(dir = path.resolve("prisma/migrations")): Migration[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "migration.sql")))
    .map((d) => ({ name: d.name, sql: fs.readFileSync(path.join(dir, d.name, "migration.sql"), "utf8") }));
}

async function main() {
  const conn = await mariadb.createConnection(mariadbConfig(process.env.DATABASE_URL));
  try {
    const applied = await applyMigrations(conn, migrationsFromDisk(), (m) => console.log(m));
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "No pending migrations.");
  } finally {
    await conn.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? "")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
