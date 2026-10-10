"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { EntryReason } from "@/generated/prisma/enums";
import { requirePermission } from "@/server/auth/dal";
import { entryFormSchema, voidSchema } from "@/lib/validation/entries";
import { keepReasonFields } from "@/lib/stock/fields";
import { createEntry, type SavedEntry } from "@/server/stock/createEntry";
import { voidEntry, type VoidResult } from "@/server/stock/voidEntry";
import { guarded, UserFacingError, type ActionResult } from "./result";

/** Save a Stock In / Stock Out form. Roles, warehouses and stock are enforced by the entry service. */
export async function saveEntry(values: unknown): Promise<ActionResult<SavedEntry>> {
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

    const saved = await createEntry(db, user, {
      direction: v.direction,
      reason,
      warehouseId: v.warehouseId,
      lines: v.lines,
      note: v.note,
      photoUrl,
      ...details,
    });
    revalidatePath("/entries");
    revalidatePath("/");
    return saved;
  });
}

export async function voidEntryAction(values: unknown): Promise<ActionResult<VoidResult>> {
  return guarded(async () => {
    const user = await requirePermission("entry:void");
    const { entryId, reason } = voidSchema.parse(values);
    const result = await voidEntry(db, user, { entryId, reason });
    revalidatePath("/entries");
    revalidatePath(`/entries/${entryId}`);
    revalidatePath("/");
    return result;
  });
}
