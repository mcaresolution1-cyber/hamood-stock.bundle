/**
 * Read-only ledger check for tests: recompute every product × warehouse quantity from the entry lines
 * and compare with the StockLevel cache. They must always match (CLAUDE.md "The ledger").
 */
import { expect } from "vitest";
import { testDb } from "./db";

export async function ledgerTotals() {
  const rows = await testDb.$queryRaw<{ productId: string; warehouseId: string; qty: bigint }[]>`
    SELECT l.productId, e.warehouseId,
      SUM(l.quantity * CASE
        WHEN e.type IN ('IN', 'TRANSFER_IN', 'CORRECTION_IN') THEN 1
        WHEN e.type IN ('OUT', 'TRANSFER_OUT', 'CORRECTION_OUT') THEN -1
        WHEN e.type = 'VOID' AND v.type IN ('IN', 'TRANSFER_IN', 'CORRECTION_IN') THEN -1
        ELSE 1 END) AS qty
    FROM StockEntryLine l
    JOIN StockEntry e ON e.id = l.entryId
    LEFT JOIN StockEntry v ON v.id = e.linkedEntryId AND e.type = 'VOID'
    GROUP BY l.productId, e.warehouseId`;
  return new Map(rows.map((r) => [`${r.productId}|${r.warehouseId}`, Number(r.qty)]));
}

export async function expectLedgerMatchesLevels() {
  const [ledger, levels] = await Promise.all([ledgerTotals(), testDb.stockLevel.findMany()]);
  const cache = new Map(levels.map((l) => [`${l.productId}|${l.warehouseId}`, l.quantity]));
  for (const key of new Set([...ledger.keys(), ...cache.keys()])) {
    expect(cache.get(key) ?? 0, `StockLevel ${key}`).toBe(ledger.get(key) ?? 0);
  }
}

export async function level(productId: string, warehouseId: string) {
  const row = await testDb.stockLevel.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } });
  return row?.quantity ?? 0;
}
