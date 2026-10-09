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
      warehouses: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export type UserRow = Awaited<ReturnType<typeof listUsers>>[number];
