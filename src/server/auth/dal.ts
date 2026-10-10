/**
 * Data Access Layer for authentication/authorization.
 *
 * The JWT only proves who signed in. Role, active flag and warehouse assignments are
 * re-read from the database on every request (cached per request), so deactivating a
 * user or changing their role takes effect immediately.
 *
 * EVERY server action and route handler must start with requireUser()/requirePermission().
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can, canWriteToWarehouse, type Action } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Assigned warehouses (relevant for STAFF). */
  warehouseIds: string[];
};

export class AuthorizationError extends Error {
  constructor(message = "forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      warehouses: { select: { id: true } },
    },
  });
  if (!user || !user.active) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    warehouseIds: user.warehouses.map((w) => w.id),
  };
});

/** For pages and layouts: redirects to /login when there is no valid user. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Throws AuthorizationError if the current user's role may not perform `action`. */
export async function requirePermission(action: Action): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, action)) throw new AuthorizationError();
  return user;
}

/** Throws AuthorizationError if the user may not create entries in `warehouseId`. */
export function assertCanWriteToWarehouse(user: CurrentUser, warehouseId: string): void {
  if (!canWriteToWarehouse(user, warehouseId)) throw new AuthorizationError();
}
