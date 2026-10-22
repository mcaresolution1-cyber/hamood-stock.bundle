/**
 * Stock In / Stock Out form schema — the SAME schema validates the form in the browser and the input
 * in the server action. Required fields depend on the reason (spec Phase 2):
 *   Supplier delivery  supplier (from the list) + invoice no.      Customer return  order no. OR customer name, condition
 *   Correction ±       note                             Website order    WooCommerce order no.
 *   Direct sale        customer name + phone            Installation     technician + customer
 *   Transfer           destination warehouse            Return to supplier  supplier (from the list) + reason
 *   Damaged/lost       note                             Noon / Amazon order  order no.
 *   A return (either way) with the reason "other" needs a note.
 * Messages are translation keys.
 */
import { z } from "zod";
import { IN_REASONS, OUT_REASONS } from "@/lib/stock/policy";
import { normalizeNumberText, toWesternDigits } from "@/lib/import/normalize";
import { id, moneyText, optionalText } from "./common";
import { MAX_PHOTOS, PAYMENT_METHODS, RETURN_CONDITIONS, SALES_CHANNELS, isOrderReason, normalizeOrder, photoRequired, reasonCodesFor, type OrderReason } from "@/lib/stock/details";
import type { EntryReason } from "@/generated/prisma/enums";
import { noteRequired } from "@/lib/stock/fields";

export const MAX_FORM_LINES = 50;

const quantity = z
  .string()
  .transform((v, ctx) => {
    const n = Number(normalizeNumberText(v));
    if (!/^\d+$/.test(normalizeNumberText(v)) || n < 1) {
      ctx.addIssue({ code: "custom", message: "validation.positiveWhole" });
      return z.NEVER;
    }
    if (n > 100_000) {
      ctx.addIssue({ code: "custom", message: "validation.tooLarge" });
      return z.NEVER;
    }
    return n;
  });

/** Saudi / international phone: digits, spaces, dashes, optional leading +. Stored without separators. */
const phone = z
  .string()
  .transform((v) => toWesternDigits(v).replace(/[\s\-()]/g, ""))
  .refine((v) => v === "" || /^\+?\d{7,15}$/.test(v), "validation.phone")
  .transform((v) => (v === "" ? null : v));

const PHOTO_PATH = /^\/api\/attachments\/[a-z0-9]{10,40}$/;
const photoUrl = z
  .string()
  .trim()
  .refine((v) => v === "" || PHOTO_PATH.test(v), "validation.photo")
  .transform((v) => (v === "" ? null : v));

export const entryFormSchema = z
  .object({
    direction: z.enum(["IN", "OUT"]),
    reason: z.enum([...new Set([...IN_REASONS, ...OUT_REASONS])] as [string, ...string[]], {
      message: "entryForm.errors.reasonRequired",
    }),
    warehouseId: z.string().min(1, "entryForm.errors.warehouseRequired").max(64),
    destinationWarehouseId: z.string().max(64),
    returnCondition: z.enum(["", ...RETURN_CONDITIONS]),
    /** Customer return: where it was sold */
    salesChannel: z.enum(["", ...SALES_CHANNELS]).default(""),
    reference: optionalText(100),
    supplierName: optionalText(100),
    /** Supplier master record (Phase B); the server stores its name on the entry too. */
    supplierId: z.string().max(64).default(""),
    customerName: optionalText(100),
    customerPhone: phone,
    technicianName: optionalText(100),
    note: optionalText(500),
    photoUrl,
    /** Several photos (Phase C1); photoUrl is kept for older clients and becomes the first one. */
    photoUrls: z.array(z.string().regex(PHOTO_PATH, "validation.photo")).max(MAX_PHOTOS, "entryForm.errors.tooManyPhotos").default([]),
    /** Return reason or damage category (src/lib/stock/details.ts) */
    reasonCode: z.string().max(32).default(""),
    paymentMethod: z.enum(["", ...PAYMENT_METHODS]).default(""),
    salesperson: optionalText(100).default(""),
    /** Return to supplier: expected credit in SAR */
    expectedCredit: moneyText.default(""),
    /** Set by the form when submitting; the same key twice returns the entry already saved. */
    idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
    lines: z
      .array(
        z.object({
          productId: id,
          quantity,
          /** Supplier delivery: unit cost in SAR (ADMIN / MANAGER only, empty = cost pending) */
          unitCost: moneyText.default(""),
        }),
      )
      .min(1, "stock.errors.noLines")
      .max(MAX_FORM_LINES, "entryForm.errors.tooManyLines"),
  })
  .superRefine((v, ctx) => {
    const need = (path: keyof typeof v, ok: unknown, message = "validation.required") => {
      if (!ok) ctx.addIssue({ code: "custom", path: [path], message });
    };
    const reasons: readonly string[] = v.direction === "IN" ? IN_REASONS : OUT_REASONS;
    if (!reasons.includes(v.reason) || v.reason === "OPENING_STOCK") {
      need("reason", false, "entryForm.errors.reasonRequired");
      return;
    }
    if (isOrderReason(v.reason as EntryReason)) {
      need("reference", v.reference);
      const message = v.reason === "WEBSITE_ORDER" ? "entryForm.errors.websiteOrder" : "entryForm.errors.marketplaceOrder";
      if (v.reference) need("reference", normalizeOrder(v.reason as OrderReason, v.reference), message);
      return;
    }
    if (noteRequired(v.reason as EntryReason, v.reasonCode)) need("note", v.note);
    switch (v.reason) {
      case "SUPPLIER_DELIVERY":
        need("supplierId", v.supplierId, "suppliers.errors.required");
        need("reference", v.reference);
        break;
      case "CUSTOMER_RETURN":
        need("reference", v.reference, "entryForm.errors.orderRequired");
        need("returnCondition", v.returnCondition);
        need("salesChannel", v.salesChannel);
        need("reasonCode", reasonCodesFor(v.reason).includes(v.reasonCode));
        break;
      case "DAMAGED_LOST":
        need("reasonCode", reasonCodesFor(v.reason).includes(v.reasonCode));
        if (photoRequired(v.reason, v.reasonCode)) need("photoUrls", v.photoUrls.length > 0 || v.photoUrl, "entryForm.errors.photoRequired");
        break;
      case "DIRECT_SALE":
        need("customerName", v.customerName);
        need("customerPhone", v.customerPhone);
        need("paymentMethod", v.paymentMethod);
        break;
      case "INSTALLATION":
        need("technicianName", v.technicianName);
        need("customerName", v.customerName);
        break;
      case "TRANSFER":
        need("destinationWarehouseId", v.destinationWarehouseId, "entryForm.errors.destinationRequired");
        if (v.destinationWarehouseId && v.destinationWarehouseId === v.warehouseId) {
          need("destinationWarehouseId", false, "stock.errors.sameWarehouse");
        }
        break;
      case "SUPPLIER_RETURN":
        need("supplierId", v.supplierId, "suppliers.errors.required");
        need("reasonCode", reasonCodesFor(v.reason).includes(v.reasonCode));
        break;
    }
  });

export type EntryFormValues = z.input<typeof entryFormSchema>;
export type EntryFormOutput = z.output<typeof entryFormSchema>;

export const emptyEntryForm = (direction: "IN" | "OUT"): EntryFormValues => ({
  direction,
  reason: "",
  warehouseId: "",
  destinationWarehouseId: "",
  returnCondition: "",
  salesChannel: "",
  reference: "",
  supplierName: "",
  supplierId: "",
  customerName: "",
  customerPhone: "",
  technicianName: "",
  note: "",
  photoUrl: "",
  photoUrls: [],
  reasonCode: "",
  paymentMethod: "",
  salesperson: "",
  expectedCredit: "",
  lines: [],
});

export const voidSchema = z.object({
  entryId: id,
  reason: z.string().trim().min(3, "void.errors.reasonRequired").max(500, "validation.tooLong"),
  /** One key per open dialog: a repeated submit returns the request already saved. */
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
});
