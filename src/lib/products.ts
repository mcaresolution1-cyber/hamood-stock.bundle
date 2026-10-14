/** Product status (decision PB1). */
export const PRODUCT_STATUSES = ["ACTIVE", "DISCONTINUED", "INACTIVE"] as const;
export type ProductStatusName = (typeof PRODUCT_STATUSES)[number];

/** Can new stock of this product be received (stock in, returns, opening stock)? Only ACTIVE. */
export function canReceive(status: ProductStatusName): boolean {
  return status === "ACTIVE";
}

/** Can this product leave, move or be corrected? ACTIVE and DISCONTINUED (sell-off, Q7). INACTIVE: never. */
export function canMove(status: ProductStatusName): boolean {
  return status !== "INACTIVE";
}

/** Is this product reordered / shown in low stock? Only ACTIVE (discontinued: sell remaining, don't reorder). */
export function isReordered(status: ProductStatusName): boolean {
  return status === "ACTIVE";
}

/** The image to show in small places: uploaded images have a thumbnail size, external URLs are used as they are. */
export function thumbSrc(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  return imageUrl.startsWith("/api/product-images/") ? `${imageUrl}?size=thumb` : imageUrl;
}

type Searchable = {
  sku?: string | null;
  barcode?: string | null;
  nameEn: string;
  nameAr: string;
  variant?: string | null;
  sizeRange?: string | null;
  colour?: string | null;
  vesa?: string | null;
  wooSku?: string | null;
};

/** Extra words a product picker / search matches besides the model code (attributes are searchable, brief P1.1). */
export function searchKeywords(p: Searchable): string[] {
  return [p.sku, p.barcode, p.nameEn, p.nameAr, p.variant, p.sizeRange, p.colour, p.vesa, p.wooSku].filter(
    (k): k is string => Boolean(k),
  );
}

/**
 * "32–70″ · Black · 45 kg · VESA 600×400 · …" — the attributes that are set, for product cards. Sizes,
 * loads and VESA are wrapped in left-to-right isolates so "32–70″" doesn't turn around in Arabic text.
 */
export function attributeLine(p: { sizeRange?: string | null; colour?: string | null; maxLoadKg?: number | null; vesa?: string | null; variant?: string | null }, kg: string): string {
  const ltr = (v: string) => `\u2066${v}\u2069`;
  return [
    p.sizeRange ? ltr(p.sizeRange) : null,
    p.colour,
    p.maxLoadKg != null ? `${ltr(String(p.maxLoadKg))} ${kg}` : null,
    p.vesa ? `VESA ${ltr(p.vesa)}` : null,
    p.variant,
  ]
    .filter(Boolean)
    .join(" · ");
}
