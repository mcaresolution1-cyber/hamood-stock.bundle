/**
 * Product costs (decision PC3). The weighted-average cost of a product is Σ(quantity × unit cost) ÷ Σ quantity
 * over every non-voided supplier-delivery line with a cost. Where no delivery has a cost yet, the product's own
 * cost is used. Server only — callers decide who may see it (cost:view).
 */
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Tx } from "./createEntry";

type Client = PrismaClient | Tx;

/** productId → weighted-average delivery cost (Decimal, 2 decimals). Products without delivery costs are absent. */
export async function averageCosts(client: Client, productIds?: readonly string[]): Promise<Map<string, Prisma.Decimal>> {
  if (productIds && productIds.length === 0) return new Map();
  const only = productIds ? Prisma.sql`AND l.productId IN (${Prisma.join(productIds)})` : Prisma.empty;
  const rows = await client.$queryRaw<{ productId: string; avg: Prisma.Decimal | string }[]>`
    SELECT l.productId, ROUND(SUM(l.quantity * c.unitCost) / SUM(l.quantity), 2) AS avg
    FROM \`StockEntryLine\` l
    JOIN \`LineCost\` c ON c.lineId = l.id
    JOIN \`StockEntry\` e ON e.id = l.entryId
    WHERE e.reason = 'SUPPLIER_DELIVERY' AND e.voidedAt IS NULL ${only}
    GROUP BY l.productId`;
  return new Map(rows.map((r) => [r.productId, new Prisma.Decimal(r.avg)]));
}

/** The cost used for stock value: the weighted average, else the product's own cost, else null. */
export async function effectiveCosts(
  client: Client,
  products: readonly { id: string; cost: Prisma.Decimal | null }[],
): Promise<Map<string, Prisma.Decimal | null>> {
  const avg = await averageCosts(client, products.map((p) => p.id));
  return new Map(products.map((p) => [p.id, avg.get(p.id) ?? p.cost]));
}
