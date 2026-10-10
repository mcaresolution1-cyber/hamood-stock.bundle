/**
 * Role rules — pure functions, no I/O, unit tested in permissions.test.ts.
 * These decide WHAT a role may do. Server actions and routes must call them
 * (via src/server/auth/dal.ts) on every request; UI checks are only cosmetic.
 */
import type { Role } from "@/generated/prisma/enums";

export type Action =
  | "entry:create" // IN / OUT / TRANSFER
  | "entry:correct" // CORRECTION_IN / CORRECTION_OUT
  | "entry:void"
  | "stock:view"
  | "cost:view"
  | "product:manage"
  | "warehouse:manage"
  | "user:manage";

const ROLE_ACTIONS: Record<Role, readonly Action[]> = {
  ADMIN: [
    "entry:create",
    "entry:correct",
    "entry:void",
    "stock:view",
    "cost:view",
    "product:manage",
    "warehouse:manage",
    "user:manage",
  ],
  STAFF: ["entry:create", "stock:view"],
  VIEWER: ["stock:view"],
};

export function can(role: Role, action: Action): boolean {
  return ROLE_ACTIONS[role].includes(action);
}

export type WarehouseScopedUser = {
  role: Role;
  /** IDs of warehouses assigned to the user (only meaningful for STAFF). */
  warehouseIds: readonly string[];
};

/**
 * May this user create entries in this warehouse?
 * ADMIN: any warehouse. STAFF: only assigned ones. VIEWER: none.
 * A transfer must pass this check for BOTH the source and destination warehouse.
 */
export function canWriteToWarehouse(user: WarehouseScopedUser, warehouseId: string): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "STAFF") return user.warehouseIds.includes(warehouseId);
  return false;
}
