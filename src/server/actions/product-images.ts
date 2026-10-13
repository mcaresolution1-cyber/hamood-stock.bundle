"use server";

import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/dal";
import { guarded, UserFacingError, type ActionResult } from "./result";

/** Limits match the database CHECKs on ProductImage (decision PB2). */
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_THUMB_BYTES = 256 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Does the file start like the image type it claims to be? (the browser-made JPEG, or a PNG/WebP) */
function looksLike(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

async function readImage(value: FormDataEntryValue | null, max: number) {
  if (!(value instanceof File) || value.size === 0) throw new UserFacingError("import.errors.noFile");
  if (!TYPES.has(value.type)) throw new UserFacingError("photo.errors.type");
  if (value.size > max) throw new UserFacingError("photo.errors.tooBig");
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (!looksLike(value.type, bytes)) throw new UserFacingError("photo.errors.type");
  return { type: value.type, bytes };
}

/**
 * Store a product photo already resized in the browser: `file` (≤ 800 px) and `thumb` (≤ 240 px).
 * Returns the path to put in the product's image field; it only becomes the product's image when the
 * product form is saved.
 */
export async function uploadProductImage(formData: FormData): Promise<ActionResult<{ url: string }>> {
  return guarded(async () => {
    const user = await requirePermission("product:manage");
    const full = await readImage(formData.get("file"), MAX_BYTES);
    const thumb = await readImage(formData.get("thumb"), MAX_THUMB_BYTES);
    if (thumb.type !== "image/jpeg") throw new UserFacingError("photo.errors.type"); // served as JPEG
    const image = await db.productImage.create({
      data: { mimeType: full.type, size: full.bytes.length, data: full.bytes, thumb: thumb.bytes, createdById: user.id },
      select: { id: true },
    });
    return { url: `/api/product-images/${image.id}` };
  });
}
