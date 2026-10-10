/**
 * Integration tests use their own database so they can TRUNCATE freely:
 * TEST_DATABASE_URL if set, otherwise DATABASE_URL with "_test" appended to the database name.
 */
import "dotenv/config";

export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set — run scripts/cloud-setup.sh or create .env");
  const url = new URL(base);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  url.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
  return url.toString();
}
