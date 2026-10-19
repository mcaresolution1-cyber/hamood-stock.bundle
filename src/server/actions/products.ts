"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { PRODUCT_STATUSES } from "@/lib/products";
import { id as idSchema } from "@/lib/validation/common";
import { requirePermission } from "@/server/auth/dal";
import { audit, changedFields } from "@/server/audit";
import { productColumns, productSchema, type ProductInput } from "@/lib/validation/products";
import { nextCounterValue, type Tx } from "@/server/stock/createEntry";
import { formatSku } from "@/lib/products";
import { SKU_COUNTER } from "@/lib/stock/numbering";
import { guarded, isForeignKeyViolation, isUniqueViolation, UserFacingError, type ActionResult } from "./result";

/** Which unique field a P2002 hit (model code, SKU or barcode), as a translation key. */
function uniqueError(e: unknown): UserFacingError | null {
  if (isForeignKeyViolation(e)) return new UserFacingError("products.errors.unknownCategory");
  if (!isUniqueViolation(e)) return null;
  // The index name says which field: "Product_modelCode_key", "Product_barcode_key", "Product_sku_key".
  const target = JSON.stringify((e as { meta?: unknown }).meta ?? "") + String((e as Error).message ?? "");
  const index = /Product_(\w+?)_key/.exec(target)?.[1] ?? "";
  if (index === "barcode") return new UserFacingError("products.errors.barcodeTaken");
  if (index === "sku") return new UserFacingError("products.errors.skuTaken");
  return new UserFacingError("products.errors.codeTaken");
}

/** Supplier / image / warehouses referenced by the form must exist (and the supplier be active). */
async function checkReferences(tx: Tx, data: ProductInput, currentSupplierId: string | null = null, currentCategoryIds: readonly string[] = []) {
  const columns = productColumns(data);
  if (data.defaultSupplierId && data.defaultSupplierId !== currentSupplierId) {
    const ok = await tx.supplier.count({ where: { id: data.defaultSupplierId, active: true } });
    if (!ok) throw new UserFacingError("products.errors.unknownSupplier");
  }
  if (columns.imageId && !(await tx.productImage.count({ where: { id: columns.imageId } }))) {
    throw new UserFacingError("validation.photo");
  }
  // Categories must exist; a product may keep an inactive one it already has, but not get a new inactive one.
  // Share-locked so hiding or deleting one (FOR UPDATE) waits for this save.
  await tx.$queryRaw`SELECT id FROM \`Category\` WHERE id IN (${Prisma.join(data.categoryIds)}) LOCK IN SHARE MODE`;
  const usable = await tx.category.count({
    where: { id: { in: data.categoryIds }, OR: [{ active: true }, { id: { in: [...currentCategoryIds] } }] },
  });
  if (usable !== data.categoryIds.length) throw new UserFacingError("products.errors.unknownCategory");
  const warehouseIds = [...new Set(data.reorder.map((r) => r.warehouseId))];
  if (warehouseIds.length !== data.reorder.length) throw new UserFacingError("errors.invalidInput");
  if (warehouseIds.length && (await tx.warehouse.count({ where: { id: { in: warehouseIds } } })) !== warehouseIds.length) {
    throw new UserFacingError("users.errors.unknownWarehouse");
  }
}

/** Replace the product's categories; their order on the form is kept (position 0 = main). */
async function saveCategories(tx: Tx, productId: string, categoryIds: readonly string[]) {
  await tx.productCategory.deleteMany({ where: { productId } });
  await tx.productCategory.createMany({ data: categoryIds.map((categoryId, position) => ({ productId, categoryId, position })) });
}

/** Replace the per-warehouse reorder levels (rows left empty on the form have no override). */
async function saveReorder(tx: Tx, productId: string, rows: ProductInput["reorder"]) {
  await tx.productReorder.deleteMany({ where: { productId } });
  if (rows.length) await tx.productReorder.createMany({ data: rows.map((r) => ({ ...r, productId })) });
}

/**
 * Inactive = retired (PB1): only with no stock anywhere. Locks the product row; entry saves share-lock
 * their products (createEntryInTx), so no stock can arrive between this check and the status change.
 */
async function assertCanRetire(tx: Tx, productId: string) {
  await tx.$queryRaw`SELECT id FROM \`Product\` WHERE id = ${productId} FOR UPDATE`;
  const sum = await tx.stockLevel.aggregate({ where: { productId }, _sum: { quantity: true } });
  if ((sum._sum.quantity ?? 0) > 0) throw new UserFacingError("products.errors.retireHasStock");
}

/** Cost for audit/history comparisons: "12.5" from the form and 12.50 from the database are equal. */
const costOf = (v: string | Prisma.Decimal | null) => (v === null ? null : new Prisma.Decimal(v).toFixed(2));

/** English names of categories, in the given order (the audit log shows names, not ids). */
async function categoryNamesOf(tx: Tx, ids: readonly string[]) {
  const rows = await tx.category.findMany({ where: { id: { in: [...ids] } }, select: { id: true, nameEn: true } });
  const byId = new Map(rows.map((r) => [r.id, r.nameEn]));
  return ids.map((id) => byId.get(id) ?? id);
}

function forAudit(data: ProductInput, categories: string[]) {
  const { imageId: _imageId, ...columns } = productColumns(data);
  void _imageId;
  return {
    ...columns,
    cost: data.cost === null ? null : new Prisma.Decimal(data.cost),
    sellingPrice: data.sellingPrice === null ? null : new Prisma.Decimal(data.sellingPrice),
    reorder: data.reorder,
    categories,
  };
}

export async function createProduct(values: unknown): Promise<ActionResult<{ id: string; sku: string }>> {
  return guarded(async () => {
    const actor = await requirePermission("product:manage");
    const data = productSchema.parse(values);
    if (data.status === "INACTIVE") throw new UserFacingError("products.errors.newInactive");
    try {
      const p = await db.$transaction(async (tx) => {
        await checkReferences(tx, data);
        // The next SKU in order (HMD00001, …), reserved inside this transaction (plan import-sku, PS1).
        const sku = formatSku(await nextCounterValue(tx, SKU_COUNTER));
        const created = await tx.product.create({ data: { ...productColumns(data), sku }, select: { id: true, sku: true } });
        await saveCategories(tx, created.id, data.categoryIds);
        await saveReorder(tx, created.id, data.reorder);
        if (data.cost !== null) {
          await tx.productCost.create({ data: { productId: created.id, cost: data.cost, source: "MANUAL", changedById: actor.id } });
        }
        await audit(tx, actor.id, {
          action: "product.create",
          subjectType: "product",
          subjectId: created.id,
          subjectLabel: data.modelCode,
          after: { sku, ...forAudit(data, await categoryNamesOf(tx, data.categoryIds)) },
        });
        return created;
      });
      revalidatePath("/admin/products");
      return p;
    } catch (e) {
      throw uniqueError(e) ?? e;
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
        const before = await tx.product.findUnique({
          where: { id: productId },
          include: {
            reorder: { select: { warehouseId: true, reorderLevel: true, reorderQty: true }, orderBy: { warehouseId: "asc" } },
            categories: { select: { categoryId: true }, orderBy: [{ position: "asc" }, { categoryId: "asc" }] },
          },
        });
        if (!before) throw new UserFacingError("errors.notFound");
        const beforeCategoryIds = before.categories.map((c) => c.categoryId);
        await checkReferences(tx, data, before.defaultSupplierId, beforeCategoryIds);
        if (data.status === "INACTIVE" && before.status !== "INACTIVE") await assertCanRetire(tx, productId);

        await tx.product.update({ where: { id: productId }, data: productColumns(data) });
        await saveCategories(tx, productId, data.categoryIds);
        await saveReorder(tx, productId, data.reorder);
        if (costOf(before.cost) !== costOf(data.cost)) {
          await tx.productCost.create({ data: { productId, cost: data.cost, source: "MANUAL", changedById: actor.id } });
        }
        const after = forAudit(data, await categoryNamesOf(tx, data.categoryIds));
        after.reorder = [...after.reorder].sort((a, b) => a.warehouseId.localeCompare(b.warehouseId));
        const diff = changedFields({ ...before, reorder: before.reorder, categories: await categoryNamesOf(tx, beforeCategoryIds) }, after);
        if (diff) {
          await audit(tx, actor.id, { action: "product.update", subjectType: "product", subjectId: productId, subjectLabel: data.modelCode, ...diff });
        }
      });
    } catch (e) {
      throw uniqueError(e) ?? e;
    }
    revalidatePath("/admin/products");
    revalidatePath(`/products/${productId}`);
    return null;
  });
}

/**
 * Change only the status from the products list (decision PB1). Discontinued keeps history and
 * remaining stock; Inactive needs zero stock.
 */
export async function setProductStatus(id: string, status: string): Promise<ActionResult> {
  return guarded(async () => {
    const actor = await requirePermission("product:manage");
    const input = z.object({ id: idSchema, status: z.enum(PRODUCT_STATUSES) }).parse({ id, status });
    await db.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id: input.id }, select: { modelCode: true, status: true } });
      if (!before) throw new UserFacingError("errors.notFound");
      if (before.status === input.status) return;
      if (input.status === "INACTIVE") await assertCanRetire(tx, input.id);
      await tx.product.update({ where: { id: input.id }, data: { status: input.status } });
      await audit(tx, actor.id, {
        action: "product.update",
        subjectType: "product",
        subjectId: input.id,
        subjectLabel: before.modelCode,
        before: { status: before.status },
        after: { status: input.status },
      });
    });
    revalidatePath("/admin/products");
    return null;
  });
}
