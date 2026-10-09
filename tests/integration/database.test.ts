import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";

describe("test database", () => {
  beforeEach(resetDatabase);
  afterAll(() => testDb.$disconnect());

  it("has every migration applied", async () => {
    const pending = await testDb.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM _prisma_migrations WHERE finished_at IS NULL`;
    expect(Number(pending[0].n)).toBe(0);
  });

  it("starts empty (except counters) and builds fixtures", async () => {
    expect(await testDb.product.count()).toBe(0);
    expect((await testDb.counter.findMany()).map((c) => [c.key, c.value]).sort()).toEqual(
      [["COR", 0], ["IN", 0], ["OUT", 0], ["TRF", 0], ["VOID", 0]],
    );
    const w = await makeWarehouse();
    const u = await makeUser("STAFF", [w.id]);
    await makeProduct("HMD-772");
    expect(u.warehouses.map((x) => x.id)).toEqual([w.id]);
    expect(await testDb.product.findUnique({ where: { modelCode: "HMD-772" } })).not.toBeNull();
  });

  it("rejects a negative stock level at the database level", async () => {
    const [w, p] = await Promise.all([makeWarehouse(), makeProduct()]);
    await expect(
      // rules-allow: stocklevel-write — proves the CHECK constraint, the service is not involved
      testDb.$executeRaw`INSERT INTO "StockLevel" ("productId", "warehouseId", quantity) VALUES (${p.id}, ${w.id}, -1)`,
    ).rejects.toThrow(/StockLevel_quantity_non_negative|check constraint/i);
  });
});
