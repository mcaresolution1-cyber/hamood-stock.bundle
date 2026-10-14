/**
 * Entry detail codes (v2 Phase C1). Pure. Labels live in messages/*.json → entryForm.codes.*.
 */
import type { EntryReason } from "@/generated/prisma/enums";

export const RETURN_REASONS = ["WRONG_SIZE", "CHANGED_MIND", "DEFECTIVE", "DAMAGED_IN_DELIVERY", "INSTALLATION_CANCELLED", "OTHER"] as const;
export const DAMAGE_REASONS = ["BROKEN_WAREHOUSE", "BROKEN_DELIVERY", "MISSING", "OBSOLETE"] as const;
export const PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** The reason codes a stock reason uses (customer return reasons, damage categories), or none. */
export function reasonCodesFor(reason: EntryReason | "" | undefined): readonly string[] {
  if (reason === "CUSTOMER_RETURN") return RETURN_REASONS;
  if (reason === "DAMAGED_LOST") return DAMAGE_REASONS;
  return [];
}

/** "Broken" damage needs a photo (brief P1.4). */
export function photoRequired(reason: EntryReason | "" | undefined, reasonCode: string | null | undefined): boolean {
  return reason === "DAMAGED_LOST" && (reasonCode === "BROKEN_WAREHOUSE" || reasonCode === "BROKEN_DELIVERY");
}

/** Reasons that may carry photos (stock in, and damaged / lost). */
export function photosAllowed(direction: "IN" | "OUT", reason: EntryReason | "" | undefined): boolean {
  return direction === "IN" || reason === "DAMAGED_LOST";
}

export const MAX_PHOTOS = 5;

/**
 * hamoodtv.com (WooCommerce) order numbers are digits; people type "#12345" or "12 345".
 * Returns the digits, or null when it doesn't look like an order number.
 */
export function normalizeWebsiteOrder(value: string | null | undefined): string | null {
  const v = (value ?? "").replace(/[\s#]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return /^\d{3,12}$/.test(v) ? v : null;
}

/** "OUT-000123" → it's an entry number (a customer return pointing at the exact sale). */
export function looksLikeEntryNumber(value: string): boolean {
  return /^OUT-\d{6,}$/i.test(value.trim());
}
