/** Expected failures of the entry service. Server actions turn these into translated messages. */

export class InsufficientStockError extends Error {
  constructor(
    readonly details: {
      productId: string;
      modelCode: string;
      warehouseName: string;
      available: number;
      requested: number;
    },
  ) {
    super(`Only ${details.available} ${details.modelCode} left in ${details.warehouseName}`);
    this.name = "InsufficientStockError";
  }
}

/** A business rule was broken. `key` is a next-intl message key, `params` its values. */
export class EntryRuleError extends Error {
  constructor(
    readonly key: string,
    readonly params: Record<string, string | number> = {},
  ) {
    super(key);
    this.name = "EntryRuleError";
  }
}
