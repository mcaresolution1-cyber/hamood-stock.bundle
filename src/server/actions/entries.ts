"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import type { EntryReason } from "@/generated/prisma/enums";
import { requirePermission } from "@/server/auth/dal";
import { entryFormSchema, voidSchema } from "@/lib/validation/entries";
import { keepReasonFields } from "@/lib/stock/fields";
import { MAX_PHOTOS, ORDER_REASONS, isOrderReason, normalizeOrder, photosAllowed } from "@/lib/stock/details";
import { submitEntry, submitVoid, type EntrySubmitResult, type VoidSubmitResult } from "@/server/stock/approvals";
import { guarded, UserFacingError, type ActionResult } from "./result";

/**
 * Save a Stock In / Stock Out form. Roles, warehouses and stock are enforced by the entry service.
 * A correction / damaged-lost above the user's approval limit is saved as a request instead.
 */
export async function saveEntry(values: unknown): Promise<ActionResult<EntrySubmitResult>> {
  return guarded(async () => {
    const user = await requirePermission("entry:create");
    const v = entryFormSchema.parse(values);
    const reason = v.reason as EntryReason;
    const details = keepReasonFields(reason, {
      supplierId: v.supplierId || null,
      supplierName: null as string | null,
      reference: v.reference,
      customerName: v.customerName,
      customerPhone: v.customerPhone,
      technicianName: v.technicianName,
      returnCondition: v.returnCondition || null,
      destinationWarehouseId: v.destinationWarehouseId || null,
      reasonCode: v.reasonCode || null,
      paymentMethod: v.paymentMethod || null,
      // A direct sale's salesperson defaults to whoever records it.
      salesperson: v.salesperson ?? (reason === "DIRECT_SALE" ? user.name : null),
      expectedCredit: v.expectedCredit,
    });
    if (isOrderReason(reason)) details.reference = normalizeOrder(reason, details.reference);

    // The supplier must be an active one; its name is stored on the entry as it is today.
    if (details.supplierId) {
      const supplier = await db.supplier.findFirst({ where: { id: details.supplierId, active: true }, select: { nameEn: true } });
      if (!supplier) throw new UserFacingError("products.errors.unknownSupplier");
      details.supplierName = supplier.nameEn;
    }

    // Photos only on stock in and damaged/lost, and only ones this user uploaded and nobody used yet.
    const photoUrls = photosAllowed(v.direction, reason) ? [...new Set([...v.photoUrls, ...(v.photoUrl ? [v.photoUrl] : [])])] : [];
    if (photoUrls.length > MAX_PHOTOS) throw new UserFacingError("entryForm.errors.tooManyPhotos");
    if (photoUrls.length) {
      const ids = photoUrls.map((u) => u.split("/").pop()!);
      const owned = await db.attachment.count({ where: { id: { in: ids }, createdById: user.id, entries: { none: {} } } });
      if (owned !== ids.length) throw new UserFacingError("validation.photo");
    }

    // Delivery unit costs (empty = cost pending). The entry service checks who may enter them.
    const lineCosts: Record<string, string> = {};
    if (reason === "SUPPLIER_DELIVERY") {
      for (const l of v.lines) {
        if (l.unitCost === null) continue;
        if (lineCosts[l.productId] !== undefined && lineCosts[l.productId] !== l.unitCost) throw new UserFacingError("entryForm.errors.twoCosts");
        lineCosts[l.productId] = l.unitCost;
      }
    }

    const saved = await submitEntry(db, user, {
      direction: v.direction,
      reason,
      warehouseId: v.warehouseId,
      lines: v.lines.map(({ productId, quantity }) => ({ productId, quantity })),
      note: v.note,
      photoUrls,
      lineCosts,
      idempotencyKey: v.idempotencyKey ?? null,
      ...details,
    });
    revalidatePath("/entries");
    revalidatePath("/approvals");
    revalidatePath("/");
    return saved;
  });
}

/** Void an entry — or, above the manager's approval limit, ask for approval. */
export async function voidEntryAction(values: unknown): Promise<ActionResult<VoidSubmitResult>> {
  return guarded(async () => {
    const user = await requirePermission("entry:void");
    const { entryId, reason, idempotencyKey } = voidSchema.parse(values);
    const result = await submitVoid(db, user, { entryId, reason, idempotencyKey });
    revalidatePath("/entries");
    revalidatePath("/approvals");
    revalidatePath(`/entries/${entryId}`);
    revalidatePath("/");
    return result;
  });
}

/**
 * Duplicate invoice warning (Phase B): a non-voided supplier delivery with the same supplier and invoice
 * number. Only a warning — the form can still be saved (decision PB3).
 */
export async function findDuplicateInvoice(values: unknown): Promise<ActionResult<{ id: string; number: string } | null>> {
  return guarded(async () => {
    await requirePermission("entry:create");
    const { supplierId, reference } = z
      .object({ supplierId: z.string().min(1).max(64), reference: z.string().trim().min(1).max(100) })
      .parse(values);
    return db.stockEntry.findFirst({
      where: { supplierId, reference, reason: "SUPPLIER_DELIVERY", voidedAt: null },
      orderBy: { entryDate: "desc" },
      select: { id: true, number: true },
    });
  });
}

/**
 * Repeated order warning (PC2): a non-voided sale on the same channel (website, Noon, Amazon) with the same
 * order number. Only a warning.
 */
export async function findRepeatedOrder(values: unknown): Promise<ActionResult<{ id: string; number: string } | null>> {
  return guarded(async () => {
    await requirePermission("entry:create");
    const { reason, reference } = z.object({ reason: z.enum(ORDER_REASONS), reference: z.string().max(100) }).parse(values);
    const order = normalizeOrder(reason, reference);
    if (!order) return null;
    return db.stockEntry.findFirst({
      where: { reason, reference: order, voidedAt: null },
      orderBy: { entryDate: "desc" },
      select: { id: true, number: true },
    });
  });
}
