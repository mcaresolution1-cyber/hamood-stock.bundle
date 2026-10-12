/**
 * The minimum a fresh database needs before anyone can work: entry counters, the two default
 * warehouses and the first admin. Idempotent and safe to run on every start-up:
 * - counters: created if missing (never reset),
 * - warehouses: only when there are no warehouses at all (renamed/deactivated ones are left alone),
 * - first admin: only when there are NO users at all, so a password left in the hosting settings can
 *   never re-create or reset an account later.
 * Never touches stock (stock only comes from entries).
 */
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import { ENTRY_NUMBER_PREFIXES } from "@/lib/stock/numbering";

export const DEFAULT_WAREHOUSES = [
  { name: "Riyadh Main", city: "Riyadh", kind: "SELLABLE" as const },
  { name: "Damaged Stock", city: "Riyadh", kind: "DAMAGED" as const },
];

export type FirstAdmin = { email?: string; password?: string };

export function firstAdminFromEnv(env: NodeJS.ProcessEnv = process.env): FirstAdmin {
  return { email: env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || "admin@hamoodtv.local", password: env.SEED_ADMIN_PASSWORD };
}

export async function ensureBaseData(db: PrismaClient, admin: FirstAdmin, log: (m: string) => void = () => {}) {
  await db.counter.createMany({
    data: Object.values(ENTRY_NUMBER_PREFIXES).map((key) => ({ key, value: 0 })),
    skipDuplicates: true,
  });

  if ((await db.warehouse.count()) === 0) {
    await db.warehouse.createMany({ data: DEFAULT_WAREHOUSES, skipDuplicates: true });
    log(`created warehouses: ${DEFAULT_WAREHOUSES.map((w) => w.name).join(", ")}`);
  }

  if ((await db.user.count()) > 0) return { adminCreated: false };

  const { email, password } = admin;
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email) || !password || password === "CHANGE_ME" || password.length < 8) {
    log("no users yet — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (8+ characters) and restart to create the first admin");
    return { adminCreated: false };
  }
  try {
    await db.user.create({
      data: { name: "Admin", email, passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" },
    });
  } catch (e) {
    // Two processes starting on an empty database: the other one created this admin first.
    if ((e as { code?: string }).code === "P2002") return { adminCreated: false };
    throw e;
  }
  log(`created the first admin: ${email}`);
  return { adminCreated: true };
}
