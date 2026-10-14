/**
 * Which detail fields each reason uses (shown in the form; anything else is dropped on the server).
 * Required-ness is enforced by the Zod schema in src/lib/validation/entries.ts. Pure.
 */
import type { EntryReason } from "@/generated/prisma/enums";

export type DetailField =
  | "supplierId"
  | "supplierName"
  | "reference"
  | "customerName"
  | "customerPhone"
  | "technicianName"
  | "returnCondition"
  | "destinationWarehouseId"
  | "reasonCode"
  | "paymentMethod"
  | "salesperson"
  | "expectedCredit";

export type FieldSpec = { field: DetailField; required: boolean };

const SPEC: Partial<Record<EntryReason, FieldSpec[]>> = {
  SUPPLIER_DELIVERY: [
    { field: "supplierId", required: true },
    { field: "reference", required: true },
  ],
  CUSTOMER_RETURN: [
    { field: "returnCondition", required: true },
    { field: "reference", required: true },
    { field: "reasonCode", required: true },
    { field: "customerName", required: false },
  ],
  WEBSITE_ORDER: [
    { field: "reference", required: true },
    { field: "customerName", required: false },
  ],
  DIRECT_SALE: [
    { field: "customerName", required: true },
    { field: "customerPhone", required: true },
    { field: "paymentMethod", required: true },
    { field: "reference", required: false },
    { field: "salesperson", required: false },
  ],
  INSTALLATION: [
    { field: "technicianName", required: true },
    { field: "customerName", required: true },
    { field: "customerPhone", required: false },
    { field: "reference", required: false },
  ],
  TRANSFER: [{ field: "destinationWarehouseId", required: true }],
  SUPPLIER_RETURN: [
    { field: "supplierId", required: true },
    { field: "reference", required: false },
    { field: "expectedCredit", required: false },
  ],
  DAMAGED_LOST: [{ field: "reasonCode", required: true }],
};

export function fieldsFor(reason: EntryReason | "" | undefined): FieldSpec[] {
  return reason ? (SPEC[reason] ?? []) : [];
}

/** Note is required for corrections, damaged/lost and returns to supplier (the reason sent back). */
export function noteRequired(reason: EntryReason | "" | undefined): boolean {
  return reason === "CORRECTION" || reason === "DAMAGED_LOST" || reason === "SUPPLIER_RETURN";
}

/** Keep only the fields this reason uses; everything else becomes null. */
export function keepReasonFields<T extends Partial<Record<DetailField, unknown>>>(reason: EntryReason, values: T): T {
  const allowed = new Set(fieldsFor(reason).map((f) => f.field));
  const out = { ...values };
  for (const key of [
    "supplierId",
    "supplierName",
    "reference",
    "customerName",
    "customerPhone",
    "technicianName",
    "returnCondition",
    "destinationWarehouseId",
    "reasonCode",
    "paymentMethod",
    "salesperson",
    "expectedCredit",
  ] as const) {
    if (!allowed.has(key) && key in out) (out as Record<string, unknown>)[key] = null;
  }
  return out;
}
