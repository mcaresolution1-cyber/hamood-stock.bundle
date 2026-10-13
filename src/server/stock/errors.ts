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

/**
 * This correction / damaged-lost entry or void is above the approval limit for this user. Thrown by the
 * entry and void services BEFORE anything is written; submitEntry / submitVoid turn it into an
 * ApprovalRequest in the same transaction (docs/plans/v2.md, decision V1).
 */
export class ApprovalRequiredError extends Error {
  constructor(
    readonly need: {
      rule: "correction" | "damaged" | "void";
      units: number;
      /** Σ quantity × cost (SAR, 2 decimals) or null when no line has a cost */
      value: string | null;
      warehouseId: string;
      otherWarehouseId?: string | null;
      /** voids: the entry to void (the OUT half of a transfer) */
      targetEntryId?: string | null;
    },
  ) {
    super(`approval required (${need.rule})`);
    this.name = "ApprovalRequiredError";
  }
}
