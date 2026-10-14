import { describe, expect, it } from "vitest";
import { lowStockOf } from "./low-stock";

const base = { sellableWarehouseIds: ["a", "b"], reorder: [] as { warehouseId: string; reorderLevel: number; reorderQty: number }[] };

describe("lowStockOf", () => {
  it("uses the default level on the sellable total when there are no own levels", () => {
    expect(lowStockOf({ ...base, lowStockLevel: 5, qty: { a: 2, b: 3 } })).toMatchObject({ low: true, suggestedQty: 1 });
    expect(lowStockOf({ ...base, lowStockLevel: 5, qty: { a: 2, b: 4, x: 100 } }).low).toBe(false);
    expect(lowStockOf({ ...base, lowStockLevel: 0, qty: {} }).low).toBe(false);
  });

  it("uses per-warehouse levels when set, with the reorder quantity", () => {
    const reorder = [
      { warehouseId: "a", reorderLevel: 3, reorderQty: 10 },
      { warehouseId: "b", reorderLevel: 2, reorderQty: 0 },
    ];
    expect(lowStockOf({ ...base, reorder, lowStockLevel: 100, qty: { a: 3, b: 9 } })).toEqual({
      low: true,
      lowWarehouseIds: ["a"],
      suggestedQty: 10,
      shortBy: 0,
    });
    expect(lowStockOf({ ...base, reorder, lowStockLevel: 100, qty: { a: 4, b: 0 } })).toMatchObject({ low: true, lowWarehouseIds: ["b"], suggestedQty: 2 });
    expect(lowStockOf({ ...base, reorder, lowStockLevel: 100, qty: { a: 4, b: 3 } }).low).toBe(false);
  });

  it("ignores levels for warehouses that aren't active sellable ones", () => {
    const reorder = [{ warehouseId: "damaged", reorderLevel: 5, reorderQty: 1 }];
    expect(lowStockOf({ ...base, reorder, lowStockLevel: 1, qty: { a: 5 } }).low).toBe(false);
  });
});
