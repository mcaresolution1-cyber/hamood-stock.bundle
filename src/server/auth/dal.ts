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
import { SESSION_ABSOLUTE_MS } from "@/auth.config";
import { db } from "@/lib/db";
import { can, canWriteToWarehouse, type Action } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Assigned warehouses (relevant for STAFF and MANAGER). */
  warehouseIds: string[];
  /** New user or password reset by an admin: must choose a password before anything else. */
  mustChangePassword: boolean;
};

/** Is this session still valid? Signed in within 24 h, and not before the last password change. */
export function sessionStillValid(authAt: number | undefined, passwordChangedAt: Date | null, now = Date.now()): boolean {
  if (authAt !== undefined && now - authAt > SESSION_ABSOLUTE_MS) return false;
  if (passwordChangedAt && (authAt === undefined || authAt < passwordChangedAt.getTime())) return false;
  return true;
}

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
      mustChangePassword: true,
      passwordChangedAt: true,
      warehouses: { select: { id: true } },
    },
  });
  if (!user || !user.active) return null;
  if (!sessionStillValid(session.authAt, user.passwordChangedAt)) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    warehouseIds: user.warehouses.map((w) => w.id),
    mustChangePassword: user.mustChangePassword,
  };
});

export const CHANGE_PASSWORD_PATH = "/account/password";

/**
 * For pages, layouts and actions: redirects to /login when there is no valid user, and to the
 * change-password page while the user must choose a new password (except where that is allowed).
 */
export async function requireUser(options: { allowPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options.allowPasswordChange) redirect(CHANGE_PASSWORD_PATH);
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

/**
 * For pages: like requirePermission, but sends the user to the dashboard with a "not allowed"
 * notice instead of throwing (a thrown error would show the error page).
 */
export async function requirePagePermission(action: Action): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, action)) redirect("/?denied=1");
  return user;
}
