"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label }: { label: string }) {
  return (
    <Button onClick={() => window.print()} className="h-11">
      <PrinterIcon className="size-4" aria-hidden />
      {label}
    </Button>
  );
}
