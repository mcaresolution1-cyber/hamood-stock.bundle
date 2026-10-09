/**
 * Line helpers for the entry service and reports. Pure.
 */
import type { EntryType } from "@/generated/prisma/enums";

export type LineInput = { productId: string; quantity: number };

/**
 * Sum duplicate products into one line and sort by productId. The sort gives every transaction the
 * same lock order on StockLevel rows, which prevents deadlocks between concurrent saves.
 */
export function mergeLines(lines: readonly LineInput[]): LineInput[] {
  const totals = new Map<string, number>();
  for (const { productId, quantity } of lines) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Invalid quantity ${quantity} for product ${productId}`);
    }
    totals.set(productId, (totals.get(productId) ?? 0) + quantity);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([productId, quantity]) => ({ productId, quantity }));
}

const DIRECTION: Record<Exclude<EntryType, "VOID">, 1 | -1> = {
  IN: 1,
  TRANSFER_IN: 1,
  CORRECTION_IN: 1,
  OUT: -1,
  TRANSFER_OUT: -1,
  CORRECTION_OUT: -1,
};

/**
 * +1 if an entry of `type` adds stock to its warehouse, -1 if it removes stock.
 * A VOID entry does the opposite of the entry it reverses (`voidedType`).
 */
export function directionOf(type: EntryType, voidedType?: EntryType | null): 1 | -1 {
  if (type === "VOID") {
    if (!voidedType || voidedType === "VOID") throw new Error("A VOID entry needs the type of the entry it voids");
    return DIRECTION[voidedType] === 1 ? -1 : 1;
  }
  return DIRECTION[type];
}

/** Signed quantity of a line: positive into the warehouse, negative out of it. */
export function signedQuantity(quantity: number, type: EntryType, voidedType?: EntryType | null): number {
  return quantity * directionOf(type, voidedType);
}
