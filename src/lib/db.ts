import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { mariadbConfig } from "@/lib/db-config";

function createClient() {
  return new PrismaClient({ adapter: new PrismaMariaDb(mariadbConfig(process.env.DATABASE_URL)) });
}

// One client per process (and across hot reloads in development).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

/**
 * Created on first use, not on import: `next build` imports server modules to collect page data, and a
 * Hostinger build may have no DATABASE_URL. A missing URL then fails the first query, with a clear error.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
