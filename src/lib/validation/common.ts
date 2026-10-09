/** Shared Zod pieces. Every message is a next-intl key (translated where shown). */
import { z } from "zod";
import { normalizeModelCode, parseMoney, parseWholeNumber } from "@/lib/import/normalize";
import { isHttpUrl } from "@/lib/import/products";

export const requiredText = (max = 200) =>
  z.string().trim().min(1, "validation.required").max(max, "validation.tooLong");

export const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, "validation.tooLong")
    .transform((v) => (v === "" ? null : v));

export const id = z.string().min(1, "validation.required").max(64);

/** Text input → whole number ≥ 0 (accepts Arabic-Indic digits). */
export const wholeNumberText = z
  .string()
  .transform((v, ctx) => {
    const n = parseWholeNumber(v);
    if (n === null) {
      ctx.addIssue({ code: "custom", message: "validation.wholeNumber" });
      return z.NEVER;
    }
    return n;
  });

/** Optional money text → decimal string or null (never a float). */
export const moneyText = z.string().transform((v, ctx) => {
  if (v.trim() === "") return null;
  const m = parseMoney(v);
  if (m === null) {
    ctx.addIssue({ code: "custom", message: "validation.money" });
    return z.NEVER;
  }
  return m;
});

export const optionalUrl = z
  .string()
  .trim()
  .max(500, "validation.tooLong")
  .refine((v) => v === "" || isHttpUrl(v), "validation.url")
  .transform((v) => (v === "" ? null : v));

export const modelCode = z
  .string()
  .transform(normalizeModelCode)
  .pipe(z.string().min(1, "validation.required").max(50, "validation.tooLong"));

export const email = z.string().trim().toLowerCase().pipe(z.email("validation.email").max(200));

export const password = z.string().min(8, "validation.passwordMin").max(200, "validation.tooLong");
