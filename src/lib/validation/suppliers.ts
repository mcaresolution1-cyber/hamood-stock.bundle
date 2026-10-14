import { z } from "zod";
import { toWesternDigits } from "@/lib/import/normalize";
import { optionalText, requiredText } from "./common";

/** Optional phone: digits, spaces, dashes, a leading +. Stored without separators. */
const optionalPhone = z
  .string()
  .transform((v) => toWesternDigits(v).replace(/[\s\-()]/g, ""))
  .refine((v) => v === "" || /^\+?\d{7,15}$/.test(v), "validation.phone")
  .transform((v) => (v === "" ? null : v));

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.email().safeParse(v).success, "validation.email")
  .refine((v) => v.length <= 200, "validation.tooLong")
  .transform((v) => (v === "" ? null : v));

export const supplierSchema = z.object({
  nameEn: requiredText(200),
  nameAr: optionalText(200),
  contactPerson: optionalText(100),
  phone: optionalPhone,
  email: optionalEmail,
  city: optionalText(100),
  country: optionalText(100),
  vatNumber: optionalText(30),
  paymentTerms: optionalText(100),
  notes: optionalText(1000),
});
export type SupplierFormValues = z.input<typeof supplierSchema>;
export type SupplierInput = z.output<typeof supplierSchema>;

/** "Add new supplier" from the stock-in form: just a name and (optionally) a phone. */
export const quickSupplierSchema = z.object({ nameEn: requiredText(200), phone: optionalPhone });

export const EMPTY_SUPPLIER: SupplierFormValues = {
  nameEn: "",
  nameAr: "",
  contactPerson: "",
  phone: "",
  email: "",
  city: "",
  country: "",
  vatNumber: "",
  paymentTerms: "",
  notes: "",
};
