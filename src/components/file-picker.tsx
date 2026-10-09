"use client";

import { useEffect, useId, useRef } from "react";
import { FileSpreadsheetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A large, touch-friendly file chooser that shows the chosen file name. */
export function FilePicker({
  label,
  buttonLabel,
  accept,
  file,
  onChange,
}: {
  label: string;
  buttonLabel: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  // When the parent clears the file (e.g. after saving), clear the input too — otherwise picking the
  // same file again fires no change event and nothing happens.
  useEffect(() => {
    if (!file && input.current) input.current.value = "";
  }, [file]);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className="h-11" onClick={() => input.current?.click()}>
          <FileSpreadsheetIcon className="size-4" aria-hidden />
          {buttonLabel}
        </Button>
        {file && (
          <span className="min-w-0 truncate text-sm text-muted-foreground" dir="ltr">
            {file.name}
          </span>
        )}
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
