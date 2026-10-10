/**
 * Which detail fields each reason uses (shown in the form; anything else is dropped on the server).
 * Required-ness is enforced by the Zod schema in src/lib/validation/entries.ts. Pure.
 */
import type { EntryReason } from "@/generated/prisma/enums";

export type DetailField =
  | "supplierName"
  | "reference"
  | "customerName"
  | "customerPhone"
  | "technicianName"
  | "returnCondition"
  | "destinationWarehouseId";

export type FieldSpec = { field: DetailField; required: boolean };

const SPEC: Partial<Record<EntryReason, FieldSpec[]>> = {
  SUPPLIER_DELIVERY: [
    { field: "supplierName", required: true },
    { field: "reference", required: true },
  ],
  CUSTOMER_RETURN: [
    { field: "returnCondition", required: true },
    { field: "reference", required: false },
    { field: "customerName", required: false },
  ],
  WEBSITE_ORDER: [
    { field: "reference", required: true },
    { field: "customerName", required: false },
  ],
  DIRECT_SALE: [
    { field: "customerName", required: true },
    { field: "customerPhone", required: true },
    { field: "reference", required: false },
  ],
  INSTALLATION: [
    { field: "technicianName", required: true },
    { field: "customerName", required: true },
    { field: "customerPhone", required: false },
    { field: "reference", required: false },
  ],
  TRANSFER: [{ field: "destinationWarehouseId", required: true }],
  SUPPLIER_RETURN: [
    { field: "supplierName", required: true },
    { field: "reference", required: false },
  ],
};

export function fieldsFor(reason: EntryReason | "" | undefined): FieldSpec[] {
  return reason ? (SPEC[reason] ?? []) : [];
}

/** Note is required for corrections and damaged/lost (it's the only explanation recorded). */
export function noteRequired(reason: EntryReason | "" | undefined): boolean {
  return reason === "CORRECTION" || reason === "DAMAGED_LOST";
}

/** Keep only the fields this reason uses; everything else becomes null. */
export function keepReasonFields<T extends Partial<Record<DetailField, unknown>>>(reason: EntryReason, values: T): T {
  const allowed = new Set(fieldsFor(reason).map((f) => f.field));
  const out = { ...values };
  for (const key of [
    "supplierName",
    "reference",
    "customerName",
    "customerPhone",
    "technicianName",
    "returnCondition",
    "destinationWarehouseId",
  ] as const) {
    if (!allowed.has(key) && key in out) (out as Record<string, unknown>)[key] = null;
  }
  return out;
}
