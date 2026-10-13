/**
 * Role rules — pure functions, no I/O, unit tested in permissions.test.ts.
 * These decide WHAT a role may do. Server actions and routes must call them
 * (via src/server/auth/dal.ts) on every request; UI checks are only cosmetic.
 */
import type { Role } from "@/generated/prisma/enums";

export type Action =
  | "entry:create" // IN / OUT / TRANSFER
  | "entry:correct" // CORRECTION_IN / CORRECTION_OUT (STAFF: through approval, decision PA2)
  | "entry:void"
  | "stock:view"
  | "cost:view"
  | "product:manage"
  | "warehouse:manage"
  | "user:manage"
  | "openingStock:import"
  | "approval:decide" // approve / reject requests (MANAGER: only for assigned warehouses)
  | "audit:view"
  | "settings:manage"
  | "supplier:manage" // edit / deactivate suppliers (adding one inline only needs entry:create, PB3)
  | "job:own"; // TECHNICIAN: his own installation jobs (Phase C)

export const ALL_ACTIONS: readonly Action[] = [
  "entry:create",
  "entry:correct",
  "entry:void",
  "stock:view",
  "cost:view",
  "product:manage",
  "warehouse:manage",
  "user:manage",
  "openingStock:import",
  "approval:decide",
  "audit:view",
  "settings:manage",
  "supplier:manage",
];

/** Roles in the order they are offered on the user form. */
export const ROLES: readonly Role[] = ["STAFF", "MANAGER", "TECHNICIAN", "ACCOUNTANT", "VIEWER", "ADMIN"];

/** Rights per role (docs/plans/v2.md, Phase A). */
const ROLE_ACTIONS: Record<Role, readonly Action[]> = {
  ADMIN: ALL_ACTIONS,
  MANAGER: ["entry:create", "entry:correct", "entry:void", "stock:view", "approval:decide", "supplier:manage"],
  STAFF: ["entry:create", "entry:correct", "stock:view"],
  TECHNICIAN: ["job:own"],
  ACCOUNTANT: ["stock:view", "cost:view", "audit:view"],
  VIEWER: ["stock:view"],
};

export function can(role: Role, action: Action): boolean {
  return ROLE_ACTIONS[role].includes(action);
}

/** Roles that work in assigned warehouses (the user form shows the warehouse list for them). */
export function usesWarehouses(role: Role): boolean {
  return role === "STAFF" || role === "MANAGER";
}

export type WarehouseScopedUser = {
  role: Role;
  /** IDs of warehouses assigned to the user (only meaningful for STAFF and MANAGER). */
  warehouseIds: readonly string[];
};

/**
 * May this user create entries in this warehouse?
 * ADMIN: any warehouse. STAFF / MANAGER: only assigned ones. Everyone else: none.
 */
export function canWriteToWarehouse(user: WarehouseScopedUser, warehouseId: string): boolean {
  if (user.role === "ADMIN") return true;
  if (usesWarehouses(user.role)) return user.warehouseIds.includes(warehouseId);
  return false;
}
