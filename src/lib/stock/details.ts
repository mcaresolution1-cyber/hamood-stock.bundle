/**
 * Entry detail codes (v2 Phase C1). Pure. Labels live in messages/*.json → entryForm.codes.*.
 */
import type { EntryReason } from "@/generated/prisma/enums";

export const RETURN_REASONS = ["WRONG_SIZE", "CHANGED_MIND", "DEFECTIVE", "DAMAGED_IN_DELIVERY", "INSTALLATION_CANCELLED", "OTHER"] as const;
export const DAMAGE_REASONS = ["BROKEN_WAREHOUSE", "BROKEN_DELIVERY", "MISSING", "OBSOLETE"] as const;
/** Why stock goes back to the supplier (plan channels-returns). */
export const SUPPLIER_RETURN_REASONS = ["DEFECTIVE", "WRONG_ITEM", "DAMAGED_IN_DELIVERY", "EXCESS_STOCK", "OTHER"] as const;
/** System-only damage code: the automatic write-off of a customer return marked trashed (never on the form). */
export const RETURNED_TRASHED = "RETURNED_TRASHED";

/**
 * Condition of a returned item (plan channels-returns): resellable → a sellable warehouse; broken → a
 * damaged-stock warehouse; trashed → a damaged-stock warehouse, then written off at once.
 */
export const RETURN_CONDITIONS = ["RESELLABLE", "BROKEN", "TRASHED"] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

/** The warehouse kind a returned item in this condition goes into. */
export function conditionWarehouseKind(condition: ReturnCondition | "" | null | undefined): "SELLABLE" | "DAMAGED" {
  return condition === "BROKEN" || condition === "TRASHED" ? "DAMAGED" : "SELLABLE";
}

/**
 * Where a returned item was sold (plan channels-returns follow-up). A return is matched only against that
 * channel's sales; the showroom covers direct sales and installations.
 */
export const SALES_CHANNELS = ["WEBSITE", "SHOWROOM", "NOON", "AMAZON"] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];
const CHANNEL_SALES: Record<SalesChannel, readonly EntryReason[]> = {
  WEBSITE: ["WEBSITE_ORDER"],
  SHOWROOM: ["DIRECT_SALE", "INSTALLATION"],
  NOON: ["NOON_ORDER"],
  AMAZON: ["AMAZON_ORDER"],
};
export function channelSaleReasons(channel: SalesChannel): readonly EntryReason[] {
  return CHANNEL_SALES[channel];
}

/** Sales recorded against an order number from a sales channel (website, Noon, Amazon). */
export const ORDER_REASONS = ["WEBSITE_ORDER", "NOON_ORDER", "AMAZON_ORDER"] as const satisfies readonly EntryReason[];
export type OrderReason = (typeof ORDER_REASONS)[number];
export function isOrderReason(reason: EntryReason | "" | undefined | null): reason is OrderReason {
  return (ORDER_REASONS as readonly string[]).includes(reason ?? "");
}
export const PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** The reason codes a stock reason uses (customer return reasons, damage categories), or none. */
export function reasonCodesFor(reason: EntryReason | "" | undefined): readonly string[] {
  if (reason === "CUSTOMER_RETURN") return RETURN_REASONS;
  if (reason === "DAMAGED_LOST") return DAMAGE_REASONS;
  if (reason === "SUPPLIER_RETURN") return SUPPLIER_RETURN_REASONS;
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

/**
 * Noon and Amazon order numbers are letters, digits and dashes (e.g. "NAE12345678", "171-1234567-1234567").
 * Removes spaces and "#", uses Western digits and upper case; null when it doesn't look like one.
 */
export function normalizeMarketplaceOrder(value: string | null | undefined): string | null {
  const v = (value ?? "")
    .replace(/[\s#]/g, "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{2,39}$/.test(v) && /\d/.test(v) ? v : null;
}

/** The stored form of a channel order number, or null when it isn't valid for that channel. */
export function normalizeOrder(reason: OrderReason, value: string | null | undefined): string | null {
  return reason === "WEBSITE_ORDER" ? normalizeWebsiteOrder(value) : normalizeMarketplaceOrder(value);
}

/** How a return's order no. is stored for its channel (like the sale's), or null for an entry no. / unknown format. */
export function normalizeReturnReference(channel: SalesChannel | null | undefined, value: string | null | undefined): string | null {
  if (looksLikeEntryNumber(value ?? "")) return null;
  if (channel === "WEBSITE") return normalizeWebsiteOrder(value);
  if (channel === "NOON" || channel === "AMAZON") return normalizeMarketplaceOrder(value);
  if (channel === "SHOWROOM") return null;
  return normalizeWebsiteOrder(value) ?? normalizeMarketplaceOrder(value);
}

/** "OUT-000123" → it's an entry number (a customer return pointing at the exact sale). */
export function looksLikeEntryNumber(value: string): boolean {
  return /^OUT-\d{6,}$/i.test(value.trim());
}
