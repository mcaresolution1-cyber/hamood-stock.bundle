/**
 * Stock In / Stock Out form schema — the SAME schema validates the form in the browser and the input
 * in the server action. Required fields depend on the reason (spec Phase 2):
 *   Supplier delivery  supplier name + invoice no.      Customer return  order no. OR customer name, condition
 *   Correction ±       note                             Website order    WooCommerce order no.
 *   Direct sale        customer name + phone            Installation     technician + customer
 *   Transfer           destination warehouse            Return to supplier  supplier name
 *   Damaged/lost       note
 * Messages are translation keys.
 */
import { z } from "zod";
import { IN_REASONS, OUT_REASONS } from "@/lib/stock/policy";
import { normalizeNumberText, toWesternDigits } from "@/lib/import/normalize";
import { id, optionalText } from "./common";

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

const photoUrl = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\/api\/attachments\/[a-z0-9]{10,40}$/.test(v), "validation.photo")
  .transform((v) => (v === "" ? null : v));

export const entryFormSchema = z
  .object({
    direction: z.enum(["IN", "OUT"]),
    reason: z.enum([...new Set([...IN_REASONS, ...OUT_REASONS])] as [string, ...string[]], {
      message: "entryForm.errors.reasonRequired",
    }),
    warehouseId: z.string().min(1, "entryForm.errors.warehouseRequired").max(64),
    destinationWarehouseId: z.string().max(64),
    returnCondition: z.enum(["", "RESELLABLE", "DAMAGED"]),
    reference: optionalText(100),
    supplierName: optionalText(100),
    customerName: optionalText(100),
    customerPhone: phone,
    technicianName: optionalText(100),
    note: optionalText(500),
    photoUrl,
    lines: z
      .array(z.object({ productId: id, quantity }))
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
    switch (v.reason) {
      case "SUPPLIER_DELIVERY":
        need("supplierName", v.supplierName);
        need("reference", v.reference);
        break;
      case "CUSTOMER_RETURN":
        need("reference", v.reference || v.customerName, "entryForm.errors.orderOrCustomer");
        need("returnCondition", v.returnCondition);
        break;
      case "CORRECTION":
      case "DAMAGED_LOST":
        need("note", v.note);
        break;
      case "WEBSITE_ORDER":
        need("reference", v.reference);
        break;
      case "DIRECT_SALE":
        need("customerName", v.customerName);
        need("customerPhone", v.customerPhone);
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
        need("supplierName", v.supplierName);
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
  reference: "",
  supplierName: "",
  customerName: "",
  customerPhone: "",
  technicianName: "",
  note: "",
  photoUrl: "",
  lines: [],
});

export const voidSchema = z.object({
  entryId: id,
  reason: z.string().trim().min(3, "void.errors.reasonRequired").max(500, "validation.tooLong"),
});
