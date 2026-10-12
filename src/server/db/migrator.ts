/**
 * Applies prisma/migrations to MariaDB without the Prisma CLI or its native engine.
 *
 * Why: Hostinger runs the app with no separate "migrate" step (and the cloud sessions block the
 * engine download), so the server applies pending migrations itself at start-up
 * (src/instrumentation.ts). It writes Prisma's own `_prisma_migrations` table with the same
 * checksums, so the regular `prisma migrate deploy` / `status` keep working against the same database.
 *
 * Safe to run from several processes at once: a MariaDB named lock serialises runs.
 * MariaDB DDL can't be rolled back, so a failed migration is recorded and blocks later runs until
 * fixed by hand (same behaviour as `prisma migrate deploy`).
 */
import { createHash, randomUUID } from "node:crypto";
import type { Connection } from "mariadb";

export type Migration = { name: string; sql: string };

const LOCK = "hamood_stock_migrations";

const HISTORY_TABLE = `CREATE TABLE IF NOT EXISTS \`_prisma_migrations\` (
    \`id\` VARCHAR(36) NOT NULL,
    \`checksum\` VARCHAR(64) NOT NULL,
    \`finished_at\` DATETIME(3) NULL,
    \`migration_name\` VARCHAR(255) NOT NULL,
    \`logs\` TEXT NULL,
    \`rolled_back_at\` DATETIME(3) NULL,
    \`started_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`applied_steps_count\` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;

export function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

/** Split a migration file into statements. Comments are dropped; statements end with ";" at end of line. */
export function splitStatements(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type HistoryRow = { migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null };

/** Applies pending migrations in name order. Returns the names applied (empty when up to date). */
export async function applyMigrations(conn: Connection, migrations: Migration[], log: (m: string) => void = () => {}) {
  const [lock] = await conn.query<{ ok: number | null }[]>("SELECT GET_LOCK(?, 120) AS ok", [LOCK]);
  if (Number(lock?.ok) !== 1) throw new Error("Could not get the migration lock within 120 s (another start-up is migrating?)");
  try {
    await conn.query(HISTORY_TABLE);
    const rows = await conn.query<HistoryRow[]>(
      "SELECT migration_name, checksum, finished_at, rolled_back_at FROM `_prisma_migrations`",
    );
    const failed = rows.find((r) => !r.finished_at && !r.rolled_back_at);
    if (failed) {
      throw new Error(
        `Migration ${failed.migration_name} failed earlier and must be fixed by hand before the app can start: ` +
          "undo the statements it already applied (applied_steps_count), then delete its row from " +
          "_prisma_migrations and restart (README → Troubleshooting).",
      );
    }
    const done = new Map(rows.filter((r) => r.finished_at).map((r) => [r.migration_name, r.checksum]));
    const applied: string[] = [];

    for (const m of [...migrations].sort((a, b) => a.name.localeCompare(b.name))) {
      const sum = checksum(m.sql);
      if (done.has(m.name)) {
        if (done.get(m.name) !== sum) log(`warning: migration ${m.name} was edited after it was applied`);
        continue;
      }
      const id = randomUUID();
      await conn.query(
        "INSERT INTO `_prisma_migrations` (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, UTC_TIMESTAMP(3), 0)",
        [id, sum, m.name],
      );
      let steps = 0;
      try {
        for (const statement of splitStatements(m.sql)) {
          await conn.query(statement);
          steps++;
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await conn.query("UPDATE `_prisma_migrations` SET logs = ?, applied_steps_count = ? WHERE id = ?", [message, steps, id]);
        throw new Error(`Migration ${m.name} failed at statement ${steps + 1}: ${message}`);
      }
      await conn.query(
        "UPDATE `_prisma_migrations` SET finished_at = UTC_TIMESTAMP(3), applied_steps_count = ? WHERE id = ?",
        [steps, id],
      );
      applied.push(m.name);
      log(`applied migration ${m.name}`);
    }
    return applied;
  } finally {
    await conn.query("SELECT RELEASE_LOCK(?)", [LOCK]);
  }
}
