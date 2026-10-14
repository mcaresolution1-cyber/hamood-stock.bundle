"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Tx } from "@/server/stock/createEntry";
import { id as idSchema } from "@/lib/validation/common";
import { requirePermission } from "@/server/auth/dal";
import { audit, changedFields } from "@/server/audit";
import { warehouseSchema } from "@/lib/validation/warehouses";
import { guarded, isUniqueViolation, UserFacingError, type ActionResult } from "./result";

/**
 * Lock the warehouse row, then count its stock. Entry saves take a share lock on the warehouse
 * (createEntryInTx), so no entry can land between this check and the caller's update.
 */
async function lockAndCountUnits(tx: Tx, warehouseId: string) {
  await tx.$queryRaw`SELECT id FROM \`Warehouse\` WHERE id = ${warehouseId} FOR UPDATE`;
  const sum = await tx.stockLevel.aggregate({ where: { warehouseId }, _sum: { quantity: true } });
  return sum._sum.quantity ?? 0;
}

export async function createWarehouse(values: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const actor = await requirePermission("warehouse:manage");
    const data = warehouseSchema.parse(values);
    try {
      const w = await db.$transaction(async (tx) => {
        const created = await tx.warehouse.create({ data, select: { id: true } });
        await audit(tx, actor.id, { action: "warehouse.create", subjectType: "warehouse", subjectId: created.id, subjectLabel: data.name, after: data });
        return created;
      });
      revalidatePath("/admin/warehouses");
      return w;
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserFacingError("warehouses.errors.nameTaken");
      throw e;
    }
  });
}

export async function updateWarehouse(id: string, values: unknown): Promise<ActionResult> {
  return guarded(async () => {
    const actor = await requirePermission("warehouse:manage");
    const warehouseId = idSchema.parse(id);
    const data = warehouseSchema.parse(values);
    try {
      await db.$transaction(async (tx) => {
        const current = await tx.warehouse.findUnique({ where: { id: warehouseId } });
        if (!current) throw new UserFacingError("errors.notFound");
        // Changing Sellable ↔ Damaged would silently reclassify stock already there (decision Q7).
        if (current.kind !== data.kind && (await lockAndCountUnits(tx, warehouseId)) > 0) {
          throw new UserFacingError("warehouses.errors.kindHasStock");
        }
        await tx.warehouse.update({ where: { id: warehouseId }, data });
        const diff = changedFields(current, data);
        if (diff) {
          await audit(tx, actor.id, { action: "warehouse.update", subjectType: "warehouse", subjectId: warehouseId, subjectLabel: data.name, ...diff });
        }
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserFacingError("warehouses.errors.nameTaken");
      throw e;
    }
    revalidatePath("/admin/warehouses");
    return null;
  });
}

export async function setWarehouseActive(id: string, active: boolean): Promise<ActionResult> {
  return guarded(async () => {
    const actor = await requirePermission("warehouse:manage");
    const input = z.object({ id: idSchema, active: z.boolean() }).parse({ id, active });
    await db.$transaction(async (tx) => {
      if (!input.active && (await lockAndCountUnits(tx, input.id)) > 0) {
        throw new UserFacingError("warehouses.errors.hasStock");
      }
      const w = await tx.warehouse.update({ where: { id: input.id }, data: { active: input.active }, select: { name: true } });
      await audit(tx, actor.id, {
        action: input.active ? "warehouse.activate" : "warehouse.deactivate",
        subjectType: "warehouse",
        subjectId: input.id,
        subjectLabel: w.name,
        after: { active: input.active },
      });
    });
    revalidatePath("/admin/warehouses");
    return null;
  });
}
