import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import "dotenv/config";

/** Same rule as tests/setup/test-db-url.ts (kept inline: Vite's config loader can't import .ts helpers). */
function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL ?? "mysql://localhost:3306/hamood_stock");
  const name = decodeURIComponent(url.pathname.slice(1));
  url.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
  return url.toString();
}

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // `server-only` throws outside React Server Components; tests import server modules directly.
  "server-only": fileURLToPath(new URL("./tests/setup/empty.ts", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/setup/global-setup.ts"],
          // App code (src/lib/db.ts) reads DATABASE_URL — point it at the test database.
          env: { DATABASE_URL: testDatabaseUrl() },
          // One shared test database: run files one at a time.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
