import { z } from "zod";
import { CATEGORIES } from "@/lib/products";
import { modelCode, moneyText, optionalText, optionalUrl, requiredText, wholeNumberText } from "./common";

export const productSchema = z.object({
  modelCode,
  nameEn: requiredText(200),
  nameAr: requiredText(200),
  category: z.enum(CATEGORIES, { message: "validation.required" }),
  variant: optionalText(200),
  imageUrl: optionalUrl,
  cost: moneyText,
  lowStockLevel: wholeNumberText,
});

export type ProductFormValues = z.input<typeof productSchema>;
export type ProductInput = z.output<typeof productSchema>;
