"use server";

import { requirePermission } from "@/server/auth/dal";
import { stockMovement, type DayMovement } from "@/server/queries/inventory";
import { guarded, type ActionResult } from "./result";

/** The dashboard's stock movement chart after a filter change (stock:view, like the dashboard). */
export async function loadStockMovement(values: unknown): Promise<ActionResult<DayMovement[]>> {
  return guarded(async () => {
    await requirePermission("stock:view");
    return stockMovement(values);
  });
}
