"use client";

import { FileDownIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog — which also offers "Save as PDF" — for a print page. */
export function PrintButton({ label, pdf = false }: { label: string; pdf?: boolean }) {
  const Icon = pdf ? FileDownIcon : PrinterIcon;
  return (
    <Button onClick={() => window.print()} className="h-11">
      <Icon className="size-4" aria-hidden />
      {label}
    </Button>
  );
}
