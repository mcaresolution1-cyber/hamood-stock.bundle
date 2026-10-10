/** Product categories (decision Q9: fixed list in v1). Labels live in messages/*.json → categories.*. */
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";

export const CATEGORIES = ["wall-mount", "floor-stand", "monitor-mount", "tv-table"] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

/** Accept a category key or its English/Arabic label (case-insensitive). */
export function categoryFromText(text: string): Category | null {
  const t = text.trim().toLowerCase();
  for (const key of CATEGORIES) {
    if (key === t) return key;
    if (en.categories[key].toLowerCase() === t || ar.categories[key].toLowerCase() === t) return key;
  }
  return null;
}
