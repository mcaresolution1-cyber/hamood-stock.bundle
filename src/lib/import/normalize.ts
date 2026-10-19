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

/**
 * A price as other software exports it → money text: currency signs and words are dropped
 * ("﷼ 500.00", "SAR 1,250", "500 ر.س" → "500.00" / "1250" / "500"). Null when it isn't money.
 */
export function parseMoneyCell(value: string): string | null {
  const stripped = value
    .replace(/﷼|ر\.?\s?س\.?|ريال|sar|sr|\$|usd/gi, "")
    .replace(/ /g, " ")
    .trim();
  return parseMoney(stripped);
}

/**
 * A stock cell → whole units ≥ 0: thousands separators, trailing ".00" and a unit word are allowed
 * ("1,943.00 Pieces", "12 pcs", "٥ قطع" → 1943 / 12 / 5). "fraction" for 1.5, null when it isn't a number.
 */
export function parseStockCell(value: string): number | "fraction" | "negative" | null {
  const m = toWesternDigits(value.replace(/ /g, " ").trim()).match(/^(-?)([\d,٬]+)(?:[.٫](\d+))?\s*[\p{L}.]*$/u);
  if (!m) return null;
  if (m[1]) return "negative";
  if (m[3] && /[1-9]/.test(m[3])) return "fraction";
  const n = Number(m[2].replace(/[,٬]/g, ""));
  return Number.isSafeInteger(n) ? n : null;
}
