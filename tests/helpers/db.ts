/**
 * Database helpers for integration tests. Build fixtures through the real services; never write
 * StockLevel or entries directly (scripts/check-rules.mjs enforces this).
 */
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { Role, WarehouseKind } from "@/generated/prisma/enums";
import { testDatabaseUrl } from "../setup/test-db-url";

export const testDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl() }) });

const TABLES = [
  "StockEntryLine",
  "StockEntry",
  "StockLevel",
  "Counter",
  "Attachment",
  "_UserWarehouses",
  "Product",
  "Warehouse",
  "User",
];

/** Empty every application table. Call in beforeEach. */
export async function resetDatabase() {
  const existing = await testDb.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const names = new Set(existing.map((t) => t.tablename));
  const list = TABLES.filter((t) => names.has(t))
    .map((t) => `"${t}"`)
    .join(", ");
  await testDb.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

let seq = 0;
const next = () => ++seq;

export async function makeUser(role: Role = "ADMIN", warehouseIds: string[] = []) {
  const n = next();
  return testDb.user.create({
    data: {
      name: `${role} ${n}`,
      email: `${role.toLowerCase()}${n}@test.local`,
      passwordHash: await bcrypt.hash("password", 4),
      role,
      warehouses: { connect: warehouseIds.map((id) => ({ id })) },
    },
    include: { warehouses: { select: { id: true } } },
  });
}

export async function makeWarehouse(kind: WarehouseKind = "SELLABLE", name?: string) {
  return testDb.warehouse.create({ data: { name: name ?? `Warehouse ${next()}`, city: "Riyadh", kind } });
}

export async function makeProduct(modelCode?: string) {
  const n = next();
  return testDb.product.create({
    data: {
      modelCode: modelCode ?? `TST-${n}`,
      nameEn: `Test product ${n}`,
      nameAr: `منتج تجريبي ${n}`,
      category: "wall-mount",
    },
  });
}
