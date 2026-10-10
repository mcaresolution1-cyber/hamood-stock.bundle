/**
 * MariaDB-specific guarantees the app relies on (Hostinger): UTC storage whatever the server/Node time
 * zone, READ COMMITTED sessions, the start-up migrator and the start-up base data.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import mariadb from "mariadb";
import { createEntry } from "@/server/stock/createEntry";
import { applyMigrations, checksum, splitStatements } from "@/server/db/migrator";
import { ensureBaseData } from "@/server/db/base-data";
import { mariadbConfig } from "@/lib/db-config";
import { migrationsFromDisk } from "../../scripts/migrate";
import { testDatabaseUrl } from "../setup/test-db-url";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";

const cfg = () => mariadbConfig(testDatabaseUrl());

beforeEach(resetDatabase);
afterAll(() => testDb.$disconnect());

describe("sessions", () => {
  it("run in UTC with READ COMMITTED, whatever the server default is", async () => {
    const [row] = await testDb.$queryRaw<{ tz: string; iso: string }[]>`
      SELECT @@session.time_zone AS tz, @@session.tx_isolation AS iso`;
    expect(row.tz).toBe("+00:00");
    expect(row.iso).toBe("READ-COMMITTED");
  });

  it("stores timestamps as UTC (Prisma defaults and DB defaults agree)", async () => {
    const w = await makeWarehouse();
    const p = await makeProduct();
    const u = await makeUser("ADMIN");
    const before = Date.now();
    const e = await createEntry(testDb, { id: u.id, role: "ADMIN", warehouseIds: [] }, {
      direction: "IN", reason: "SUPPLIER_DELIVERY", warehouseId: w.id, lines: [{ productId: p.id, quantity: 1 }],
    });
    const saved = await testDb.stockEntry.findUniqueOrThrow({ where: { id: e.id } });
    expect(Math.abs(saved.createdAt.getTime() - before)).toBeLessThan(60_000);
    expect(Math.abs(saved.entryDate.getTime() - before)).toBeLessThan(60_000);

    // Read the raw column on a plain UTC connection: it must be the UTC wall time.
    const conn = await mariadb.createConnection({ ...cfg(), dateStrings: true });
    try {
      const [raw] = await conn.query<{ createdAt: string; now: string }[]>(
        "SELECT createdAt, UTC_TIMESTAMP(3) AS now FROM StockEntry WHERE id = ?",
        [e.id],
      );
      const asUtc = (s: string) => new Date(`${s.replace(" ", "T")}Z`).getTime();
      expect(Math.abs(asUtc(raw.createdAt) - asUtc(raw.now))).toBeLessThan(60_000);
    } finally {
      await conn.end();
    }
  });
});

describe("start-up migrator", () => {
  const db = `${cfg().database}_migrator`;
  async function fresh() {
    const root = await mariadb.createConnection({ ...cfg(), database: undefined });
    await root.query(`DROP DATABASE IF EXISTS \`${db}\``);
    await root.query(`CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await root.end();
    return mariadb.createConnection({ ...cfg(), database: db });
  }

  it("applies every migration once, records Prisma-compatible history, and is idempotent", async () => {
    const conn = await fresh();
    try {
      const migrations = migrationsFromDisk();
      expect(await applyMigrations(conn, migrations)).toEqual(migrations.map((m) => m.name));
      expect(await applyMigrations(conn, migrations)).toEqual([]);
      const rows = await conn.query<{ migration_name: string; checksum: string; finished_at: Date | null }[]>(
        "SELECT migration_name, checksum, finished_at FROM _prisma_migrations",
      );
      expect(rows).toHaveLength(migrations.length);
      for (const r of rows) {
        expect(r.finished_at).not.toBeNull();
        expect(r.checksum).toBe(checksum(migrations.find((m) => m.name === r.migration_name)!.sql));
      }
      const tables = (await conn.query<Record<string, string>[]>("SHOW TABLES")).map((r) => Object.values(r)[0]);
      expect(tables).toEqual(expect.arrayContaining(["StockEntry", "StockLevel", "User", "_prisma_migrations"]));
    } finally {
      await conn.end();
    }
  });

  it("records a failing migration and refuses to continue until it's fixed", async () => {
    const conn = await fresh();
    try {
      const bad = [{ name: "20990101000000_bad", sql: "CREATE TABLE ok_one (id INT);\nTHIS IS NOT SQL;\n" }];
      await expect(applyMigrations(conn, bad)).rejects.toThrow(/20990101000000_bad failed at statement 2/);
      await expect(applyMigrations(conn, migrationsFromDisk())).rejects.toThrow(/failed earlier/);
    } finally {
      await conn.end();
    }
  });

  it("serialises concurrent start-ups", async () => {
    const a = await fresh();
    const b = await mariadb.createConnection({ ...cfg(), database: db });
    try {
      const all = migrationsFromDisk();
      const [x, y] = await Promise.all([applyMigrations(a, all), applyMigrations(b, all)]);
      expect([...x, ...y]).toEqual(all.map((m) => m.name)); // applied exactly once in total
    } finally {
      await a.end();
      await b.end();
    }
  });

  it("splits statements and drops comment lines", () => {
    expect(splitStatements("-- a; comment\nCREATE TABLE a (x INT);\n\nALTER TABLE a ADD y INT;\n")).toEqual([
      "CREATE TABLE a (x INT)",
      "ALTER TABLE a ADD y INT",
    ]);
  });
});

describe("start-up base data", () => {
  const admin = { email: "owner@hamoodtv.com", password: "long-enough-1" };

  it("creates counters, default warehouses and the first admin on an empty database", async () => {
    await testDb.counter.deleteMany(); // fresh-database fixture: counters only
    const r = await ensureBaseData(testDb, admin);
    expect(r.adminCreated).toBe(true);
    expect(await testDb.counter.count()).toBe(5);
    expect((await testDb.warehouse.findMany()).map((w) => w.name).sort()).toEqual(["Damaged Stock", "Riyadh Main"]);
    expect((await testDb.user.findFirstOrThrow()).email).toBe("owner@hamoodtv.com");
  });

  it("never creates or resets an account once any user exists, and never re-adds warehouses", async () => {
    const existing = await makeUser("STAFF");
    const w = await makeWarehouse("SELLABLE", "Jeddah");
    await testDb.counter.update({ where: { key: "IN" }, data: { value: 41 } });
    const r = await ensureBaseData(testDb, admin);
    expect(r.adminCreated).toBe(false);
    expect(await testDb.user.count()).toBe(1);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: existing.id } })).passwordHash).toBe(existing.passwordHash);
    expect((await testDb.warehouse.findMany()).map((x) => x.id)).toEqual([w.id]);
    expect((await testDb.counter.findUniqueOrThrow({ where: { key: "IN" } })).value).toBe(41);
  });

  it("creates no admin from a missing or weak password", async () => {
    expect((await ensureBaseData(testDb, { email: admin.email, password: "short" })).adminCreated).toBe(false);
    expect((await ensureBaseData(testDb, { email: admin.email })).adminCreated).toBe(false);
    expect(await testDb.user.count()).toBe(0);
  });
});

describe("isolation fallback", () => {
  it("keeps READ COMMITTED unless binary logging is on in STATEMENT format", async () => {
    const { readCommittedSupported } = await import("@/lib/db-config");
    expect(readCommittedSupported({ logBin: 0, binlogFormat: "STATEMENT" })).toBe(true);
    expect(readCommittedSupported({ logBin: 1, binlogFormat: "MIXED" })).toBe(true);
    expect(readCommittedSupported({ logBin: 1, binlogFormat: "ROW" })).toBe(true);
    expect(readCommittedSupported({ logBin: 1, binlogFormat: "STATEMENT" })).toBe(false);
    expect(readCommittedSupported({ logBin: "ON", binlogFormat: "statement" })).toBe(false);
  });

  it("never leaks the password from a malformed DATABASE_URL", () => {
    expect(() => mariadbConfig("mysql://user:p#ss/word@localhost/db")).toThrow(/not a valid URL/);
    try {
      mariadbConfig("mysql://user:se#cret/x@localhost/db");
    } catch (e) {
      expect(JSON.stringify(e) + String(e)).not.toContain("se#cret");
    }
  });
});

describe("first admin race", () => {
  it("two start-ups on an empty database create exactly one admin, and neither fails", async () => {
    const admin = { email: "owner@hamoodtv.com", password: "long-enough-1" };
    const results = await Promise.all([ensureBaseData(testDb, admin), ensureBaseData(testDb, admin)]);
    expect(results.filter((r) => r.adminCreated)).toHaveLength(1);
    expect(await testDb.user.count()).toBe(1);
  });
});
