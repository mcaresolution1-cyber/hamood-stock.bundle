"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { id as idSchema } from "@/lib/validation/common";
import { requirePermission } from "@/server/auth/dal";
import { audit, changedFields } from "@/server/audit";
import { productSchema, type ProductInput } from "@/lib/validation/products";
import { guarded, isUniqueViolation, UserFacingError, type ActionResult } from "./result";

export async function createProduct(values: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const actor = await requirePermission("product:manage");
    const data = productSchema.parse(values);
    try {
      const p = await db.$transaction(async (tx) => {
        const created = await tx.product.create({ data, select: { id: true } });
        await audit(tx, actor.id, {
          action: "product.create",
          subjectType: "product",
          subjectId: created.id,
          subjectLabel: data.modelCode,
          after: forAudit(data),
        });
        return created;
      });
      revalidatePath("/admin/products");
      return p;
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserFacingError("products.errors.codeTaken");
      throw e;
    }
  });
}

export async function updateProduct(id: string, values: unknown): Promise<ActionResult> {
  return guarded(async () => {
    const actor = await requirePermission("product:manage");
    const productId = idSchema.parse(id);
    const data = productSchema.parse(values);
    try {
      await db.$transaction(async (tx) => {
        const before = await tx.product.findUnique({ where: { id: productId } });
        if (!before) throw new UserFacingError("errors.notFound");
        await tx.product.update({ where: { id: productId }, data });
        const diff = changedFields(before, forAudit(data));
        if (diff) {
          await audit(tx, actor.id, { action: "product.update", subjectType: "product", subjectId: productId, subjectLabel: data.modelCode, ...diff });
        }
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new UserFacingError("products.errors.codeTaken");
      throw e;
    }
    revalidatePath("/admin/products");
    return null;
  });
}

/** Deactivating keeps history and remaining stock; the product just stops coming in (decision Q7). */
export async function setProductActive(id: string, active: boolean): Promise<ActionResult> {
  return guarded(async () => {
    const actor = await requirePermission("product:manage");
    const input = z.object({ id: idSchema, active: z.boolean() }).parse({ id, active });
    await db.$transaction(async (tx) => {
      const p = await tx.product.update({ where: { id: input.id }, data: { active: input.active }, select: { modelCode: true } });
      await audit(tx, actor.id, {
        action: "product.update",
        subjectType: "product",
        subjectId: input.id,
        subjectLabel: p.modelCode,
        before: { active: !input.active },
        after: { active: input.active },
      });
    });
    revalidatePath("/admin/products");
    return null;
  });
}

/** Cost as a Decimal, so "12.5" from the form and 12.50 from the database compare equal. */
function forAudit(data: ProductInput) {
  return { ...data, cost: data.cost === null ? null : new Prisma.Decimal(data.cost) };
}
