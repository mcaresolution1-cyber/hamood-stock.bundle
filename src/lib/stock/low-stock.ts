/**
 * Low stock (decisions Q5 + Phase B). Pure.
 * - A product with its own reorder levels: low when any active SELLABLE warehouse with a level > 0 holds that
 *   many or fewer. Suggested quantity = that warehouse's reorder quantity, or what's missing to reach the level.
 * - Otherwise: low when the total across active SELLABLE warehouses ≤ the product's default level (0 = never).
 * Only ACTIVE products are reordered (discontinued: sell what's left).
 */
export type ReorderLevel = { warehouseId: string; reorderLevel: number; reorderQty: number };

export function lowStockOf(input: {
  lowStockLevel: number;
  qty: Record<string, number>;
  reorder: readonly ReorderLevel[];
  sellableWarehouseIds: readonly string[];
}): { low: boolean; lowWarehouseIds: string[]; suggestedQty: number; shortBy: number } {
  const sellable = new Set(input.sellableWarehouseIds);
  const own = input.reorder.filter((r) => sellable.has(r.warehouseId) && r.reorderLevel > 0);
  if (own.length) {
    const low = own.filter((r) => (input.qty[r.warehouseId] ?? 0) <= r.reorderLevel);
    const shortBy = low.reduce((s, r) => s + r.reorderLevel - (input.qty[r.warehouseId] ?? 0), 0);
    const suggestedQty = low.reduce((s, r) => s + (r.reorderQty > 0 ? r.reorderQty : Math.max(1, r.reorderLevel - (input.qty[r.warehouseId] ?? 0))), 0);
    return { low: low.length > 0, lowWarehouseIds: low.map((r) => r.warehouseId), suggestedQty, shortBy };
  }
  if (input.lowStockLevel <= 0) return { low: false, lowWarehouseIds: [], suggestedQty: 0, shortBy: 0 };
  const total = input.sellableWarehouseIds.reduce((s, id) => s + (input.qty[id] ?? 0), 0);
  const low = total <= input.lowStockLevel;
  return { low, lowWarehouseIds: [], suggestedQty: low ? Math.max(1, input.lowStockLevel - total) : 0, shortBy: input.lowStockLevel - total };
}
