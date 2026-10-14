"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { EntryReason } from "@/generated/prisma/enums";
import { requirePermission } from "@/server/auth/dal";
import { entryFormSchema, voidSchema } from "@/lib/validation/entries";
import { keepReasonFields } from "@/lib/stock/fields";
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
      supplierName: v.supplierName,
      reference: v.reference,
      customerName: v.customerName,
      customerPhone: v.customerPhone,
      technicianName: v.technicianName,
      returnCondition: v.returnCondition || null,
      destinationWarehouseId: v.destinationWarehouseId || null,
    });

    // Photos only on stock in, and only ones that were actually uploaded.
    let photoUrl: string | null = null;
    if (v.direction === "IN" && v.photoUrl) {
      const attachmentId = v.photoUrl.split("/").pop()!;
      const exists = await db.attachment.count({ where: { id: attachmentId, createdById: user.id } });
      if (!exists) throw new UserFacingError("validation.photo");
      photoUrl = v.photoUrl;
    }

    const saved = await submitEntry(db, user, {
      direction: v.direction,
      reason,
      warehouseId: v.warehouseId,
      lines: v.lines,
      note: v.note,
      photoUrl,
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
