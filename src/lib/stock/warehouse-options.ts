/**
 * Which warehouses the entry form offers for a reason. Mirrors the server rules in policy.ts so users
 * only see valid choices; the entry service still enforces everything. Pure.
 */
import type { EntryReason, WarehouseKind } from "@/generated/prisma/enums";
import { reasonAllowedForKind } from "./policy";

export type WarehouseOption = { id: string; name: string; kind: WarehouseKind; writable: boolean };

export function sourceWarehouses<T extends WarehouseOption>(
  warehouses: readonly T[],
  reason: EntryReason | "",
  returnCondition: "" | "RESELLABLE" | "DAMAGED",
): T[] {
  if (reason === "CUSTOMER_RETURN") {
    // Q2: damaged returns may go into any DAMAGED warehouse; resellable ones into your sellable ones.
    return returnCondition === "DAMAGED"
      ? warehouses.filter((w) => w.kind === "DAMAGED")
      : warehouses.filter((w) => w.writable && w.kind === "SELLABLE");
  }
  return warehouses.filter((w) => w.writable && (!reason || reasonAllowedForKind(reason, w.kind)));
}

/** Q1: a transfer may go to any other active warehouse. */
export function destinationWarehouses<T extends WarehouseOption>(warehouses: readonly T[], sourceId: string): T[] {
  return warehouses.filter((w) => w.id !== sourceId);
}
