"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Tx } from "@/server/stock/createEntry";
import type { Role } from "@/generated/prisma/enums";
import { requirePermission, type CurrentUser } from "@/server/auth/dal";
import { createUserSchema, resetPasswordSchema, updateUserSchema } from "@/lib/validation/users";
import { id as idSchema } from "@/lib/validation/common";
import { guarded, isUniqueViolation, UserFacingError, type ActionResult } from "./result";

const HASH_ROUNDS = 12;

/** Only STAFF use warehouse assignments; others get none (ADMIN = all, VIEWER = read-only). */
async function warehouseConnect(role: Role, ids: string[]) {
  if (role !== "STAFF") return [];
  const unique = [...new Set(ids)];
  const found = await db.warehouse.count({ where: { id: { in: unique }, active: true } });
  if (found !== unique.length) throw new UserFacingError("users.errors.unknownWarehouse");
  return unique.map((id) => ({ id }));
}

/**
 * An admin can't lock themselves out, and there must always be one active ADMIN.
 * Runs inside the caller's transaction after locking the active admin rows, so two admins demoting
 * each other at the same moment can't both pass the check.
 */
async function guardAdminChange(
  tx: Tx,
  actor: CurrentUser,
  targetId: string,
  change: { role?: Role; active?: boolean },
) {
  await tx.$queryRaw`SELECT id FROM \`User\` WHERE role = 'ADMIN' AND active = true ORDER BY id FOR UPDATE`;
  const target = await tx.user.findUnique({ where: { id: targetId }, select: { role: true, active: true } });
  if (!target) throw new UserFacingError("errors.notFound");
  const losesAdmin =
    target.role === "ADMIN" &&
    target.active &&
    ((change.role !== undefined && change.role !== "ADMIN") || change.active === false);
  if (!losesAdmin) return;
  if (actor.id === targetId) throw new UserFacingError("users.errors.self");
  const others = await tx.user.count({ where: { role: "ADMIN", active: true, id: { not: targetId } } });
  if (others === 0) throw new UserFacingError("users.errors.lastAdmin");
}

export async function createUser(values: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    await requirePermission("user:manage");
    const data = createUserSchema.parse(values);
    try {
      const user = await db.user.create({
        data: {
          name: data.name,
          email: data.email,
          role: data.role,
          passwordHash: await bcrypt.hash(data.password, HASH_ROUNDS),
          warehouses: { connect: await warehouseConnect(data.role, data.warehouseIds) },
        },
        select: { id: true },
      });
      revalidatePath("/admin/users");
      return user;
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserFacingError("users.errors.emailTaken");
      throw e;
    }
  });
}

export async function updateUser(id: string, values: unknown): Promise<ActionResult> {
  return guarded(async () => {
    const actor = await requirePermission("user:manage");
    const userId = idSchema.parse(id);
    const data = updateUserSchema.parse(values);
    const warehouses = await warehouseConnect(data.role, data.warehouseIds);
    try {
      await db.$transaction(async (tx) => {
        await guardAdminChange(tx, actor, userId, { role: data.role });
        await tx.user.update({
          where: { id: userId },
          data: { name: data.name, email: data.email, role: data.role, warehouses: { set: warehouses } },
        });
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserFacingError("users.errors.emailTaken");
      throw e;
    }
    revalidatePath("/admin/users");
    return null;
  });
}

export async function setUserActive(id: string, active: boolean): Promise<ActionResult> {
  return guarded(async () => {
    const actor = await requirePermission("user:manage");
    const input = z.object({ id: idSchema, active: z.boolean() }).parse({ id, active });
    await db.$transaction(async (tx) => {
      await guardAdminChange(tx, actor, input.id, { active: input.active });
      await tx.user.update({ where: { id: input.id }, data: { active: input.active } });
    });
    revalidatePath("/admin/users");
    return null;
  });
}

export async function resetUserPassword(id: string, values: unknown): Promise<ActionResult> {
  return guarded(async () => {
    await requirePermission("user:manage");
    const userId = idSchema.parse(id);
    const { password } = resetPasswordSchema.parse(values);
    const exists = await db.user.count({ where: { id: userId } });
    if (!exists) throw new UserFacingError("errors.notFound");
    await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, HASH_ROUNDS) } });
    return null;
  });
}
