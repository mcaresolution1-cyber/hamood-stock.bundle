"use server";

import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/dal";
import { guarded, UserFacingError, type ActionResult } from "./result";

const MAX_BYTES = 4 * 1024 * 1024; // decision Q10 (also the database CHECK on Attachment.size)
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Store a delivery-note photo (already resized in the browser). Returns the URL to save on the entry. */
export async function uploadAttachment(formData: FormData): Promise<ActionResult<{ url: string }>> {
  return guarded(async () => {
    const user = await requirePermission("entry:create");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserFacingError("import.errors.noFile");
    if (!TYPES.has(file.type)) throw new UserFacingError("photo.errors.type");
    if (file.size > MAX_BYTES) throw new UserFacingError("photo.errors.tooBig");
    const attachment = await db.attachment.create({
      data: {
        mimeType: file.type,
        size: file.size,
        data: new Uint8Array(await file.arrayBuffer()),
        createdById: user.id,
      },
      select: { id: true },
    });
    return { url: `/api/attachments/${attachment.id}` };
  });
}
