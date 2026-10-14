import { z } from "zod";
import { requiredText, wholeNumberText } from "./common";

export const categorySchema = z.object({
  nameEn: requiredText(100),
  nameAr: requiredText(100),
  /** Order in lists and pickers (lower first). */
  position: wholeNumberText,
});

export type CategoryFormValues = z.input<typeof categorySchema>;
export type CategoryInput = z.output<typeof categorySchema>;
