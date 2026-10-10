"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeNumberText } from "@/lib/import/normalize";

/** − [ n ] + with 44px+ targets. Value is a string so typing stays natural; Zod parses it. */
export function QuantityStepper({
  value,
  onChange,
  invalid,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  label: string;
}) {
  const t = useTranslations("entryForm");
  const n = Number(normalizeNumberText(value)) || 0;
  return (
    <div className="flex items-center gap-1" dir="ltr">
      <Button type="button" variant="outline" size="icon" className="size-11" aria-label={t("decrease")} onClick={() => onChange(String(Math.max(1, n - 1)))}>
        <MinusIcon className="size-4" aria-hidden />
      </Button>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        aria-label={label}
        aria-invalid={invalid}
        className="h-11 w-16 text-center text-base tabular-nums"
      />
      <Button type="button" variant="outline" size="icon" className="size-11" aria-label={t("increase")} onClick={() => onChange(String(n + 1))}>
        <PlusIcon className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
