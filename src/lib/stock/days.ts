/**
 * Riyadh calendar days as "YYYY-MM-DD" text (Riyadh is UTC+3 all year, no DST — the same rule as the SQL
 * `INTERVAL 3 HOUR` buckets). Pure, for the dashboard chart and the inventory report.
 */
const RIYADH_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/** The Riyadh day a moment falls on. */
export function riyadhDay(at: Date): string {
  return new Date(at.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** "2026-10-19" + 1 → "2026-10-20". */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** First moment (UTC Date) of a Riyadh day. */
export function riyadhStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - RIYADH_OFFSET_MS);
}

/** Every day from `from` to `to`, both included (empty if `to` is before `from`). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 3700; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && addDays(value, 0) === value;
}
