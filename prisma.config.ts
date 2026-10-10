import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // The CLI (migrations) uses DIRECT_URL when set — on Neon, the direct (non-pooled) connection, because
  // migrations take session-level locks that a pooler can't hold. The app itself always uses DATABASE_URL.
  datasource: {
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },
});
