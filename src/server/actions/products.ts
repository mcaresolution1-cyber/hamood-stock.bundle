"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { id as idSchema } from "@/lib/validation/common";
import { requirePermission } from "@/server/auth/dal";
import { productSchema } from "@/lib/validation/products";
import { guarded, isUniqueViolation, UserFacingError, type ActionResult } from "./result";

export async function createProduct(values: unknown): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    await requirePermission("product:manage");
    const data = productSchema.parse(values);
    try {
      const p = await db.product.create({ data, select: { id: true } });
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
    await requirePermission("product:manage");
    const productId = idSchema.parse(id);
    const data = productSchema.parse(values);
    try {
      await db.product.update({ where: { id: productId }, data });
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
    await requirePermission("product:manage");
    const input = z.object({ id: idSchema, active: z.boolean() }).parse({ id, active });
    await db.product.update({ where: { id: input.id }, data: { active: input.active } });
    revalidatePath("/admin/products");
    return null;
  });
}
