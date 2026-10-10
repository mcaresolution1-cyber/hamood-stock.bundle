/**
 * Vitest globalSetup for the "integration" project: make sure the MariaDB test database exists and
 * has all migrations applied (with the same runner the server uses at start-up).
 */
import mariadb from "mariadb";
import { mariadbConfig } from "@/lib/db-config";
import { applyMigrations } from "@/server/db/migrator";
import { migrationsFromDisk } from "../../scripts/migrate";
import { testDatabaseUrl } from "./test-db-url";

export default async function setup() {
  const config = mariadbConfig(testDatabaseUrl());
  const dbName = config.database!;
  let conn: mariadb.Connection;
  try {
    conn = await mariadb.createConnection({ ...config, database: undefined });
  } catch (e) {
    throw new Error(
      `Integration tests need MariaDB at ${config.host}:${config.port} (${(e as Error).message}). ` +
        "Start it with: bash scripts/cloud-setup.sh — or run only unit tests: pnpm test:unit",
    );
  }
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, "``")}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${dbName.replace(/`/g, "``")}\``);
    await applyMigrations(conn, migrationsFromDisk());
  } finally {
    await conn.end();
  }
}
