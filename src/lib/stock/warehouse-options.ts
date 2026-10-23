/**
 * Which warehouses the entry form offers for a reason. Mirrors the server rules in policy.ts so users
 * only see valid choices; the entry service still enforces everything. Pure.
 */
import type { EntryReason, WarehouseKind } from "@/generated/prisma/enums";
import type { ReturnCondition } from "./details";
import { reasonAllowedForKind } from "./policy";

export type WarehouseOption = { id: string; name: string; kind: WarehouseKind; writable: boolean };

export function sourceWarehouses<T extends WarehouseOption>(
  warehouses: readonly T[],
  reason: EntryReason | "",
  returnCondition: "" | ReturnCondition,
): T[] {
  if (reason === "CUSTOMER_RETURN") {
    // Q2: any DAMAGED warehouse (no assignment needed) for broken / trashed; your sellable ones for resellable
    // and broken (broken may go anywhere — damaged-stock warehouses are listed first).
    const damaged = warehouses.filter((w) => w.kind === "DAMAGED");
    const sellable = warehouses.filter((w) => w.writable && w.kind === "SELLABLE");
    if (returnCondition === "TRASHED") return damaged;
    if (returnCondition === "BROKEN") return [...damaged, ...sellable];
    return sellable;
  }
  return warehouses.filter((w) => w.writable && (!reason || reasonAllowedForKind(reason, w.kind)));
}

/** Q1: a transfer may go to any other active warehouse. */
export function destinationWarehouses<T extends WarehouseOption>(warehouses: readonly T[], sourceId: string): T[] {
  return warehouses.filter((w) => w.id !== sourceId);
}
