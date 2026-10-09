"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { id as idSchema } from "@/lib/validation/common";
import { requirePermission } from "@/server/auth/dal";
import { validateOpeningStock, type OpeningStockResult } from "@/lib/import/opening-stock";
import { readSheet } from "@/server/import/readSheet";
import { createEntryInTx } from "@/server/stock/createEntry";
import { guarded, UserFacingError, type ActionResult } from "./result";

export type OpeningStockPreview = OpeningStockResult & {
  warehouse: { id: string; name: string };
  /** Earlier opening-stock entries in this warehouse that aren't voided (decision Q6). */
  existing: { number: string; createdAt: string }[];
};

async function prepare(formData: FormData): Promise<OpeningStockPreview> {
  const warehouseId = idSchema.parse(formData.get("warehouseId"));
  const warehouse = await db.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, name: true, active: true } });
  if (!warehouse || !warehouse.active) throw new UserFacingError("stock.errors.warehouseInactive");

  const sheet = await readSheet(formData.get("file"));
  const products = await db.product.findMany({
    select: { id: true, modelCode: true, nameEn: true, nameAr: true, active: true },
  });
  const result = validateOpeningStock(sheet, new Map(products.map((p) => [p.modelCode, p])));
  const existing = await db.stockEntry.findMany({
    where: { warehouseId, reason: "OPENING_STOCK", voidedAt: null },
    select: { number: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return {
    ...result,
    warehouse: { id: warehouse.id, name: warehouse.name },
    existing: existing.map((e) => ({ number: e.number, createdAt: e.createdAt.toISOString() })),
  };
}

export async function previewOpeningStock(formData: FormData): Promise<ActionResult<OpeningStockPreview>> {
  return guarded(async () => {
    await requirePermission("product:manage");
    await requirePermission("entry:correct");
    return prepare(formData);
  });
}

/** Saves ONE `IN` / `OPENING_STOCK` entry through the normal entry service. */
export async function applyOpeningStock(formData: FormData): Promise<ActionResult<{ id: string; number: string }>> {
  return guarded(async () => {
    await requirePermission("product:manage");
    const user = await requirePermission("entry:correct");
    const confirmAdd = z.enum(["yes"]).optional().parse(formData.get("confirmAdd") ?? undefined) === "yes";
    const preview = await prepare(formData);
    if (preview.fileErrors.length || preview.totals.errors > 0) throw new UserFacingError("import.errors.fixFirst");
    const file = formData.get("file") as File;

    const entry = await db.$transaction(
      async (tx) => {
        // Serialise opening-stock saves per warehouse, then re-check Q6 inside the transaction so two
        // simultaneous submits can't both skip the confirmation.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`opening-stock:${preview.warehouse.id}`}))`;
        const earlier = await tx.stockEntry.count({
          where: { warehouseId: preview.warehouse.id, reason: "OPENING_STOCK", voidedAt: null },
        });
        if (earlier > 0 && !confirmAdd) throw new UserFacingError("openingStock.errors.confirmRequired");
        return createEntryInTx(tx, user, {
          direction: "IN",
          reason: "OPENING_STOCK",
          warehouseId: preview.warehouse.id,
          lines: preview.rows.map((r) => ({ productId: r.product!.id, quantity: r.quantity! })),
          // Only the file name: the reason already says "opening stock" in every language.
          note: file.name.slice(0, 200),
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    revalidatePath("/");
    return entry;
  });
}
