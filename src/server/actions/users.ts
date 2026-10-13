"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Tx } from "@/server/stock/createEntry";
import type { Role } from "@/generated/prisma/enums";
import { requirePermission, type CurrentUser } from "@/server/auth/dal";
import { usesWarehouses } from "@/lib/permissions";
import { audit, changedFields } from "@/server/audit";
import { createUserSchema, resetPasswordSchema, updateUserSchema } from "@/lib/validation/users";
import { id as idSchema } from "@/lib/validation/common";
import { guarded, isUniqueViolation, UserFacingError, type ActionResult } from "./result";

const HASH_ROUNDS = 12;

/** Only STAFF and MANAGER use warehouse assignments; others get none (ADMIN = all, the rest don't record stock). */
async function warehouseConnect(role: Role, ids: string[]) {
  if (!usesWarehouses(role)) return [];
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
    const actor = await requirePermission("user:manage");
    const data = createUserSchema.parse(values);
    const warehouses = await warehouseConnect(data.role, data.warehouseIds);
    const passwordHash = await bcrypt.hash(data.password, HASH_ROUNDS);
    try {
      const user = await db.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: data.name,
            email: data.email,
            role: data.role,
            passwordHash,
            mustChangePassword: true, // the admin knows this password — the user picks his own
            warehouses: { connect: warehouses },
          },
          select: { id: true },
        });
        await audit(tx, actor.id, {
          action: "user.create",
          subjectType: "user",
          subjectId: created.id,
          subjectLabel: data.email,
          after: { name: data.name, email: data.email, role: data.role, warehouses: await warehouseNames(tx, warehouses) },
        });
        return created;
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
        const before = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { name: true, email: true, role: true, warehouses: { select: { id: true } } },
        });
        await tx.user.update({
          where: { id: userId },
          data: { name: data.name, email: data.email, role: data.role, warehouses: { set: warehouses } },
        });
        const diff = changedFields(
          { ...before, warehouses: await warehouseNames(tx, before.warehouses) },
          { name: data.name, email: data.email, role: data.role, warehouses: await warehouseNames(tx, warehouses) },
        );
        if (diff) await audit(tx, actor.id, { action: "user.update", subjectType: "user", subjectId: userId, subjectLabel: data.email, ...diff });
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
      const user = await tx.user.update({ where: { id: input.id }, data: { active: input.active }, select: { email: true } });
      await audit(tx, actor.id, {
        action: input.active ? "user.activate" : "user.deactivate",
        subjectType: "user",
        subjectId: input.id,
        subjectLabel: user.email,
        after: { active: input.active },
      });
    });
    revalidatePath("/admin/users");
    return null;
  });
}

export async function resetUserPassword(id: string, values: unknown): Promise<ActionResult> {
  return guarded(async () => {
    const actor = await requirePermission("user:manage");
    const userId = idSchema.parse(id);
    const { password } = resetPasswordSchema.parse(values);
    const passwordHash = await bcrypt.hash(password, HASH_ROUNDS);
    await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!user) throw new UserFacingError("errors.notFound");
      // Signs the user out everywhere (passwordChangedAt) and makes him choose his own password next time.
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: actor.id !== userId },
      });
      await audit(tx, actor.id, { action: "user.resetPassword", subjectType: "user", subjectId: userId, subjectLabel: user.email });
    });
    revalidatePath("/admin/users");
    return null;
  });
}

/** Warehouse names for the audit log (ids mean nothing to a reader), sorted. */
async function warehouseNames(tx: Tx, refs: { id: string }[]): Promise<string[]> {
  if (!refs.length) return [];
  const rows = await tx.warehouse.findMany({ where: { id: { in: refs.map((r) => r.id) } }, select: { name: true } });
  return rows.map((r) => r.name).sort();
}
