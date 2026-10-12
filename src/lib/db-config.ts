/**
 * MariaDB connection settings from a DATABASE_URL (mysql://user:pass@host:3306/db).
 * Shared by the app (src/lib/db.ts), the startup migrator, the seed and the tests, so every
 * connection behaves the same way. No server-only import: scripts and tests use it too.
 */
import type { PoolConfig } from "mariadb";

export function mariadbConfig(url: string | undefined, overrides: Partial<PoolConfig> = {}): PoolConfig {
  if (!url) throw new Error("DATABASE_URL is not set");
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    // Never rethrow the URL error itself: it carries the full URL, password included, into the logs.
    throw new Error("DATABASE_URL is not a valid URL — URL-encode special characters in the password (@ → %40, # → %23, / → %2F)");
  }
  if (!/^(mysql|mariadb):$/.test(u.protocol)) {
    throw new Error(`DATABASE_URL must start with mysql:// (got ${u.protocol}//)`);
  }
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL has no database name");
  return {
    host: u.hostname || "localhost",
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    // Shared hosting limits connections per user: keep the pool small.
    connectionLimit: Number(u.searchParams.get("connection_limit") ?? 5),
    initSql: [
      // Every session runs in UTC, whatever the server's time zone is: Prisma stores UTC values, and
      // the raw SQL (CURRENT_TIMESTAMP defaults, report month buckets) must agree with them.
      "SET time_zone = '+00:00'",
      // READ COMMITTED (not MariaDB's default REPEATABLE READ): after taking a row lock, a transaction
      // must see the latest committed data, which the stock/void/admin checks rely on. The start-up
      // check (src/server/db/bootstrap.ts) falls back to REPEATABLE READ on servers that can't log it.
      `SET SESSION TRANSACTION ISOLATION LEVEL ${isolationLevel()}`,
    ],
    ...overrides,
  };
}

export type IsolationLevel = "READ COMMITTED" | "REPEATABLE READ";

/** Session isolation for new connections; DB_ISOLATION is set by the start-up check only. */
export function isolationLevel(): IsolationLevel {
  return process.env.DB_ISOLATION === "REPEATABLE READ" ? "REPEATABLE READ" : "READ COMMITTED";
}

/**
 * MariaDB refuses writes under READ COMMITTED when binary logging is on in STATEMENT format
 * (InnoDB can't log them safely). MIXED/ROW logging, or no binary log, are fine.
 */
export function readCommittedSupported(server: { logBin: unknown; binlogFormat: unknown }): boolean {
  const on = Number(server.logBin) === 1 || String(server.logBin).toUpperCase() === "ON";
  return !(on && String(server.binlogFormat).toUpperCase() === "STATEMENT");
}
