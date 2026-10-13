import "server-only";
import { db } from "@/lib/db";

export async function listUsers() {
  return db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      lastLoginAt: true,
      mustChangePassword: true,
      warehouses: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export type UserRow = Awaited<ReturnType<typeof listUsers>>[number];

/** One user with his last 50 sign-in attempts (newest first). */
export async function userWithLogins(id: string) {
  return db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLoginAt: true,
      mustChangePassword: true,
      loginEvents: { orderBy: { at: "desc" }, take: 50, select: { id: true, at: true, success: true, reason: true, ip: true } },
    },
  });
}
