/**
 * Product categories are data (plan ui-menu-import-categories, PU2): `Category` rows with an English and
 * Arabic name. Pure helpers shared by forms, lists, exports and the import.
 */

/** The four categories the migration creates (ids are fixed so seeds and tests can refer to them). */
export const DEFAULT_CATEGORIES = [
  { id: "cat-wall-mount", nameEn: "TV wall mounts", nameAr: "حوامل تلفزيون جدارية", position: 1 },
  { id: "cat-floor-stand", nameEn: "Floor stands", nameAr: "ستاندات أرضية", position: 2 },
  { id: "cat-monitor-mount", nameEn: "Monitor mounts", nameAr: "حوامل شاشات", position: 3 },
  { id: "cat-tv-table", nameEn: "TV tables", nameAr: "طاولات تلفزيون", position: 4 },
] as const;

/** At most this many categories on one product. */
export const MAX_PRODUCT_CATEGORIES = 10;

export type CategoryName = { nameEn: string; nameAr: string };

/** The name in the user's language. */
export function categoryName(c: CategoryName, locale: string): string {
  return locale === "ar" ? c.nameAr : c.nameEn;
}

/** Several categories in one line ("Wall mounts · Floor stands"). */
export function categoryNames(list: readonly { category: CategoryName }[] | readonly CategoryName[], locale: string): string {
  return list.map((c) => categoryName("category" in c ? c.category : c, locale)).join(" · ");
}

/**
 * One import cell → category names: separated by , ; | / or the Arabic comma ، (PU4).
 * Trimmed, inner spaces collapsed, duplicates (case-insensitive) removed, order kept.
 */
export function splitCategoryCell(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,;|/،؛]/)) {
    const name = part.replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/**
 * Key for matching a name typed in a file against a category. Case, spacing, accents and Arabic
 * diacritics don't matter — like the database's utf8mb4_unicode_ci, which keeps the names unique.
 */
export function categoryKey(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
}
