/** Helpers for values typed by people or exported from Excel. Pure. */

const ARABIC_INDIC = /[٠-٩۰-۹]/g;

/** "١٢٣" / "۱۲۳" → "123". */
export function toWesternDigits(value: string): string {
  return value.replace(ARABIC_INDIC, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Trim, Western digits, Arabic decimal/thousands separators → "." / "". */
export function normalizeNumberText(value: string): string {
  return toWesternDigits(value.trim())
    .replace(/٫/g, ".") // Arabic decimal separator
    .replace(/[٬,\s]/g, ""); // Arabic thousands separator, commas, spaces
}

/** Whole number ≥ 0, or null if the text isn't one. "1,200" → 1200, "12.0" → null. */
export function parseWholeNumber(value: string): number | null {
  const v = normalizeNumberText(value);
  if (!/^\d{1,9}$/.test(v)) return null;
  return Number(v);
}

/**
 * Money with at most 2 decimals, kept as a string (never a float) so it can go straight into
 * Prisma.Decimal. "1,250.50" → "1250.50". Returns null when invalid.
 */
export function parseMoney(value: string): string | null {
  const v = normalizeNumberText(value);
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(v)) return null;
  return v;
}

/** Model codes are compared trimmed and upper-cased: " hmd-772 " → "HMD-772". */
export function normalizeModelCode(value: string): string {
  return toWesternDigits(value).trim().replace(/\s+/g, " ").toUpperCase();
}
