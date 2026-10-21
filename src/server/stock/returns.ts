/**
 * Customer returns against the original sale (decision PC1). Inside the entry transaction:
 * - "OUT-000123" → that exact sale; anything else → every non-voided sale with that order no.
 * - The sale rows are locked FOR UPDATE, so two returns on one order are checked one after the other.
 * - Units returned on the order (non-voided returns, this one included) may not exceed the units sold.
 */
import { Prisma } from "@/generated/prisma/client";
import type { EntryReason } from "@/generated/prisma/enums";
import { ORDER_REASONS, looksLikeEntryNumber, normalizeMarketplaceOrder, normalizeWebsiteOrder } from "@/lib/stock/details";
import type { LineInput } from "@/lib/stock/lines";
import type { Tx } from "./createEntry";
import { EntryRuleError } from "./errors";

const SALES: EntryReason[] = [...ORDER_REASONS, "DIRECT_SALE", "INSTALLATION"];

/** Returns the id of the single original sale (stored on the return), or null when the order had several. */
export async function checkReturnAgainstSale(tx: Tx, reference: string | null | undefined, lines: readonly LineInput[]): Promise<string | null> {
  const ref = (reference ?? "").trim();
  if (!ref) throw new EntryRuleError("entryForm.errors.orderRequired");

  const byNumber = looksLikeEntryNumber(ref);
  // As typed, and as a website / Noon / Amazon order number is stored.
  const refs = [...new Set([ref, normalizeWebsiteOrder(ref), normalizeMarketplaceOrder(ref)].filter((r): r is string => Boolean(r)))];
  const where: Prisma.StockEntryWhereInput = byNumber
    ? { number: ref.toUpperCase(), type: "OUT", reason: { in: SALES } }
    : { reference: { in: refs }, type: "OUT", reason: { in: SALES } };
  // Lock first, then read: a void of one of these sales that commits while we wait is seen.
  const candidates = (await tx.stockEntry.findMany({ where, select: { id: true } })).map((c) => c.id).sort();
  if (candidates.length) {
    await tx.$queryRaw`SELECT id FROM \`StockEntry\` WHERE id IN (${Prisma.join(candidates)}) ORDER BY id FOR UPDATE`;
  }
  const sales = await tx.stockEntry.findMany({
    where: { id: { in: candidates }, voidedAt: null },
    select: { id: true, number: true, reference: true },
    orderBy: { id: "asc" },
  });
  if (sales.length === 0) throw new EntryRuleError("returns.errors.noSale", { reference: ref });
  const saleIds = sales.map((s) => s.id);
  // By entry number: returns made earlier by the sale's order no. count too (conservative when an order had several sales).
  const orderRefs = byNumber ? sales.map((s) => s.reference).filter((r): r is string => Boolean(r)) : refs;

  const [sold, returned] = await Promise.all([
    tx.stockEntryLine.groupBy({ by: ["productId"], where: { entryId: { in: saleIds } }, _sum: { quantity: true } }),
    tx.stockEntryLine.groupBy({
      by: ["productId"],
      where: {
        entry: {
          reason: "CUSTOMER_RETURN",
          voidedAt: null,
          OR: [{ originalEntryId: { in: saleIds } }, ...(orderRefs.length ? [{ reference: { in: orderRefs } }] : [])],
        },
      },
      _sum: { quantity: true },
    }),
  ]);
  const soldQty = new Map(sold.map((s) => [s.productId, s._sum.quantity ?? 0]));
  const returnedQty = new Map(returned.map((r) => [r.productId, r._sum.quantity ?? 0]));
  for (const line of lines) {
    const available = (soldQty.get(line.productId) ?? 0) - (returnedQty.get(line.productId) ?? 0);
    if (line.quantity > available) {
      const product = await tx.product.findUnique({ where: { id: line.productId }, select: { modelCode: true } });
      throw new EntryRuleError("returns.errors.tooMany", { modelCode: product?.modelCode ?? "", available: Math.max(0, available), reference: ref });
    }
  }
  return sales.length === 1 ? sales[0].id : null;
}
