"use client";

import { useTranslations } from "next-intl";
import type { ActionParams } from "@/server/actions/result";

/**
 * Translate a message key that came from the server or a Zod schema (e.g. "validation.required").
 * Unknown keys fall back to the generic error so users never see a raw key.
 */
export function useMessage() {
  const t = useTranslations();
  return (key: string | undefined, params?: ActionParams): string => {
    if (!key) return "";
    // Keys are dynamic here by design; t.has guards against typos.
    const k = key as Parameters<typeof t>[0];
    return t.has(k) ? t(k, params as never) : t("errors.generic");
  };
}
