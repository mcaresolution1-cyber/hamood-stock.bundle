/**
 * Database helpers for integration tests. Build fixtures through the real services; never write
 * StockLevel or entries directly (scripts/check-rules.mjs enforces this).
 */
import bcrypt from "bcryptjs";
import mariadb from "mariadb";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import type { Role, WarehouseKind } from "@/generated/prisma/enums";
import { ENTRY_NUMBER_PREFIXES } from "@/lib/stock/numbering";
import { mariadbConfig } from "@/lib/db-config";
import { testDatabaseUrl } from "../setup/test-db-url";

export const testDb = new PrismaClient({ adapter: new PrismaMariaDb(mariadbConfig(testDatabaseUrl())) });

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

/** Empty every application table and re-create the entry counters (as the seed does). Call in beforeEach. */
export async function resetDatabase() {
  // One dedicated connection, because FOREIGN_KEY_CHECKS is per session.
  const conn = await mariadb.createConnection(mariadbConfig(testDatabaseUrl()));
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of TABLES) await conn.query(`TRUNCATE TABLE \`${t}\``);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    await conn.end();
  }
  // Counters are advanced with a plain UPDATE (CLAUDE.md), so the rows must exist.
  await testDb.counter.createMany({
    data: Object.values(ENTRY_NUMBER_PREFIXES).map((key) => ({ key, value: 0 })),
  });
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
