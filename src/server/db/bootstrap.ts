/**
 * Runs once when the server starts (src/instrumentation.ts): apply pending migrations, then make sure
 * the base data exists. This is how a Hostinger deployment sets up and upgrades its own database —
 * there is no separate migrate/seed step to run. Set AUTO_MIGRATE=false to skip it.
 */
import "server-only";
import mariadb from "mariadb";
import { MIGRATIONS } from "@/generated/migrations";
import { mariadbConfig, readCommittedSupported } from "@/lib/db-config";
import { applyMigrations } from "./migrator";
import { ensureBaseData, firstAdminFromEnv } from "./base-data";

const log = (m: string) => console.log(`[startup] ${m}`);

export async function bootstrap() {
  if (process.env.AUTO_MIGRATE === "false") {
    log("AUTO_MIGRATE=false — skipping migrations, base data and server checks");
    return;
  }
  const conn = await mariadb.createConnection(mariadbConfig(process.env.DATABASE_URL, { connectTimeout: 15_000 }));
  try {
    // Decide the isolation level before the app's connection pool is created (src/lib/db.ts is lazy).
    const [server] = await conn.query<{ logBin: unknown; binlogFormat: unknown }[]>(
      "SELECT @@log_bin AS logBin, @@binlog_format AS binlogFormat",
    );
    if (!readCommittedSupported(server)) {
      process.env.DB_ISOLATION = "REPEATABLE READ"; // for the app's pool, created after this
      await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ"); // and this connection
      log("warning: this server logs statements in STATEMENT format, so READ COMMITTED isn't allowed — using REPEATABLE READ (the database constraints still prevent negative stock and double voids)");
    }
    const applied = await applyMigrations(conn, MIGRATIONS, log);
    if (!applied.length) log("database schema is up to date");
  } finally {
    await conn.end();
  }
  const { db } = await import("@/lib/db");
  await ensureBaseData(db, firstAdminFromEnv(), log);
}
