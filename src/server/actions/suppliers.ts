"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { id as idSchema } from "@/lib/validation/common";
import { quickSupplierSchema, supplierSchema } from "@/lib/validation/suppliers";
import { requirePermission } from "@/server/auth/dal";
import { audit, changedFields } from "@/server/audit";
import { guarded, isUniqueViolation, UserFacingError, type ActionResult } from "./result";

export type SupplierOption = { id: string; nameEn: string; nameAr: string | null };

export async function createSupplier(values: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const actor = await requirePermission("supplier:manage");
    const data = supplierSchema.parse(values);
    try {
      const s = await db.$transaction(async (tx) => {
        const created = await tx.supplier.create({ data, select: { id: true } });
        await audit(tx, actor.id, { action: "supplier.create", subjectType: "supplier", subjectId: created.id, subjectLabel: data.nameEn, after: data });
        return created;
      });
      revalidatePath("/admin/suppliers");
      return s;
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserFacingError("suppliers.errors.nameTaken");
      throw e;
    }
  });
}

export async function updateSupplier(id: string, values: unknown): Promise<ActionResult> {
  return guarded(async () => {
    const actor = await requirePermission("supplier:manage");
    const supplierId = idSchema.parse(id);
    const data = supplierSchema.parse(values);
    try {
      await db.$transaction(async (tx) => {
        const before = await tx.supplier.findUnique({ where: { id: supplierId } });
        if (!before) throw new UserFacingError("errors.notFound");
        await tx.supplier.update({ where: { id: supplierId }, data });
        const diff = changedFields(before, data);
        if (diff) await audit(tx, actor.id, { action: "supplier.update", subjectType: "supplier", subjectId: supplierId, subjectLabel: data.nameEn, ...diff });
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserFacingError("suppliers.errors.nameTaken");
      throw e;
    }
    revalidatePath("/admin/suppliers");
    return null;
  });
}

/** Deactivated suppliers stay on old entries but can't be picked any more. */
export async function setSupplierActive(id: string, active: boolean): Promise<ActionResult> {
  return guarded(async () => {
    const actor = await requirePermission("supplier:manage");
    const input = z.object({ id: idSchema, active: z.boolean() }).parse({ id, active });
    await db.$transaction(async (tx) => {
      const s = await tx.supplier.update({ where: { id: input.id }, data: { active: input.active }, select: { nameEn: true } });
      await audit(tx, actor.id, {
        action: input.active ? "supplier.activate" : "supplier.deactivate",
        subjectType: "supplier",
        subjectId: input.id,
        subjectLabel: s.nameEn,
        after: { active: input.active },
      });
    });
    revalidatePath("/admin/suppliers");
    return null;
  });
}

/**
 * "Add new supplier" from the stock-in form (decision PB3): anyone who records deliveries. If a supplier
 * with this name already exists (and is active) it is returned instead of failing.
 */
export async function quickAddSupplier(values: unknown): Promise<ActionResult<SupplierOption>> {
  return guarded(async () => {
    const actor = await requirePermission("entry:create");
    const data = quickSupplierSchema.parse(values);
    const existing = await db.supplier.findUnique({ where: { nameEn: data.nameEn }, select: { id: true, nameEn: true, nameAr: true, active: true } });
    if (existing) {
      if (!existing.active) throw new UserFacingError("suppliers.errors.inactive");
      return { id: existing.id, nameEn: existing.nameEn, nameAr: existing.nameAr };
    }
    try {
      return await db.$transaction(async (tx) => {
        const created = await tx.supplier.create({ data, select: { id: true, nameEn: true, nameAr: true } });
        await audit(tx, actor.id, { action: "supplier.create", subjectType: "supplier", subjectId: created.id, subjectLabel: data.nameEn, after: data });
        return created;
      });
    } catch (e) {
      // Two people adding the same name at once: return the one that won.
      if (isUniqueViolation(e)) {
        const s = await db.supplier.findUniqueOrThrow({ where: { nameEn: data.nameEn }, select: { id: true, nameEn: true, nameAr: true } });
        return s;
      }
      throw e;
    }
  });
}
