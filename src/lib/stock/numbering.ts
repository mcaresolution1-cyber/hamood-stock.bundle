/**
 * Entry numbering. Pure functions — no DB access — so they can be unit tested.
 * The counter value itself is reserved inside the save transaction (see CLAUDE.md).
 */

export const ENTRY_NUMBER_PREFIXES = {
  IN: "IN",
  OUT: "OUT",
  TRANSFER: "TRF",
  CORRECTION: "COR",
  VOID: "VOID",
} as const;

export type CounterKey = (typeof ENTRY_NUMBER_PREFIXES)[keyof typeof ENTRY_NUMBER_PREFIXES];

export type EntryTypeName =
  | "IN"
  | "OUT"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "CORRECTION_IN"
  | "CORRECTION_OUT"
  | "VOID";

/** Which counter an entry type draws its number from. Both halves of a transfer share one counter value. */
export function counterKeyFor(type: EntryTypeName): CounterKey {
  switch (type) {
    case "IN":
      return ENTRY_NUMBER_PREFIXES.IN;
    case "OUT":
      return ENTRY_NUMBER_PREFIXES.OUT;
    case "TRANSFER_OUT":
    case "TRANSFER_IN":
      return ENTRY_NUMBER_PREFIXES.TRANSFER;
    case "CORRECTION_IN":
    case "CORRECTION_OUT":
      return ENTRY_NUMBER_PREFIXES.CORRECTION;
    case "VOID":
      return ENTRY_NUMBER_PREFIXES.VOID;
  }
}

/**
 * Format an entry number, e.g. formatEntryNumber("IN", 123) → "IN-000123".
 * A transfer pair shares one counter value: the TRANSFER_OUT is "TRF-000012"
 * and its TRANSFER_IN partner is "TRF-000012-IN" (number is unique per row).
 */
export function formatEntryNumber(prefix: CounterKey, value: number, type?: EntryTypeName): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid counter value: ${value}`);
  }
  const base = `${prefix}-${String(value).padStart(6, "0")}`;
  return type === "TRANSFER_IN" ? `${base}-IN` : base;
}

/** Entry types that remove stock from their warehouse. */
export function isOutgoing(type: EntryTypeName): boolean {
  return type === "OUT" || type === "TRANSFER_OUT" || type === "CORRECTION_OUT";
}
