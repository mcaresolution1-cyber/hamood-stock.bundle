/**
 * Stock entry rules — which reasons exist per direction, which entry type each produces, who may use
 * them and in which warehouses. Pure (no I/O): used by forms to show options and by the entry
 * service to enforce them. Decisions referenced (Q1, Q2, Q4) are in docs/plans/v1.md.
 */
import type { EntryReason, EntryType, Role, WarehouseKind } from "@/generated/prisma/enums";
import { canWriteToWarehouse } from "@/lib/permissions";

export type Direction = "IN" | "OUT";

export const IN_REASONS = ["SUPPLIER_DELIVERY", "CUSTOMER_RETURN", "OPENING_STOCK", "CORRECTION"] as const;
export const OUT_REASONS = [
  "WEBSITE_ORDER",
  "DIRECT_SALE",
  "INSTALLATION",
  "TRANSFER",
  "SUPPLIER_RETURN",
  "DAMAGED_LOST",
  "CORRECTION",
] as const;

/** Reasons only an ADMIN may use. */
export const ADMIN_ONLY_REASONS: ReadonlySet<EntryReason> = new Set<EntryReason>([
  "OPENING_STOCK",
  "CORRECTION",
  "SUPPLIER_RETURN",
  "DAMAGED_LOST",
]);

/** Selling reasons — only allowed from SELLABLE warehouses (Q4). */
export const SALES_REASONS: ReadonlySet<EntryReason> = new Set<EntryReason>([
  "WEBSITE_ORDER",
  "DIRECT_SALE",
  "INSTALLATION",
]);

/** Reasons offered on the Stock In form (opening stock has its own import screen). */
const IN_FORM_REASONS: readonly EntryReason[] = ["SUPPLIER_DELIVERY", "CUSTOMER_RETURN", "CORRECTION"];

export function isValidReason(direction: Direction, reason: EntryReason): boolean {
  const list: readonly string[] = direction === "IN" ? IN_REASONS : OUT_REASONS;
  return list.includes(reason);
}

export function isReasonAllowed(role: Role, direction: Direction, reason: EntryReason): boolean {
  if (role === "VIEWER") return false;
  if (!isValidReason(direction, reason)) return false;
  return role === "ADMIN" || !ADMIN_ONLY_REASONS.has(reason);
}

/** Reasons to show on the Stock In / Stock Out form for this role, in display order. */
export function formReasons(role: Role, direction: Direction): EntryReason[] {
  const list: readonly EntryReason[] = direction === "IN" ? IN_FORM_REASONS : OUT_REASONS;
  return list.filter((r) => isReasonAllowed(role, direction, r));
}

/** The entry type a (direction, reason) pair is saved as. A transfer saves TRANSFER_OUT (+ TRANSFER_IN). */
export function entryTypeFor(direction: Direction, reason: EntryReason): EntryType {
  if (reason === "CORRECTION") return direction === "IN" ? "CORRECTION_IN" : "CORRECTION_OUT";
  if (reason === "TRANSFER") return "TRANSFER_OUT";
  return direction;
}

/** Q4: selling reasons only from SELLABLE warehouses. Everything else may use any warehouse kind. */
export function reasonAllowedForKind(reason: EntryReason, kind: WarehouseKind): boolean {
  return !(SALES_REASONS.has(reason) && kind !== "SELLABLE");
}

export type EntryActor = { id: string; role: Role; warehouseIds: readonly string[] };

/**
 * Why `actor` may NOT save this entry — a translation key — or null if allowed.
 * `warehouse` is the warehouse stock moves in/out of (the source for a transfer).
 * `damagedReturn` = a customer return marked damaged going into a DAMAGED warehouse (Q2 exception).
 */
export function entryPermissionError(
  actor: EntryActor,
  entry: {
    direction: Direction;
    reason: EntryReason;
    warehouse: { id: string; kind: WarehouseKind };
  },
): string | null {
  if (!isValidReason(entry.direction, entry.reason)) return "stock.errors.invalidReason";
  if (!isReasonAllowed(actor.role, entry.direction, entry.reason)) return "errors.forbidden";

  const damagedReturnException =
    entry.direction === "IN" && entry.reason === "CUSTOMER_RETURN" && entry.warehouse.kind === "DAMAGED";
  if (!damagedReturnException && !canWriteToWarehouse(actor, entry.warehouse.id)) {
    return "stock.errors.warehouseNotAssigned";
  }
  if (!reasonAllowedForKind(entry.reason, entry.warehouse.kind)) return "stock.errors.reasonNotForWarehouse";
  return null;
}

/** Entry types that take stock out of their warehouse. */
export const OUTGOING_TYPES: readonly EntryType[] = ["OUT", "TRANSFER_OUT", "CORRECTION_OUT"];
