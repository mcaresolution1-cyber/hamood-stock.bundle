import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Only the CLI reads this (the app connects through the adapter in src/lib/db.ts). A placeholder
  // when unset so `prisma generate` works in builds that have no database variables.
  datasource: {
    url: process.env.DATABASE_URL || "mysql://placeholder:placeholder@localhost:3306/placeholder",
  },
});
