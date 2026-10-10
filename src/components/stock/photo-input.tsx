"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CameraIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMessage } from "@/components/use-message";
import { uploadAttachment } from "@/server/actions/attachments";

const MAX_SIDE = 1600;

/** Shrink a phone photo to ≤1600px JPEG (~300 KB–1 MB) before upload (decision Q10). */
async function resize(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/jpeg", 0.8),
  );
}

export function PhotoInput({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const t = useTranslations("photo");
  const message = useMessage();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await resize(file).catch(() => file);
      const fd = new FormData();
      fd.set("file", new File([blob], "delivery-note.jpg", { type: blob.type || "image/jpeg" }));
      const result = await uploadAttachment(fd);
      if (result.ok) onChange(result.data.url);
      else toast.error(message(result.error, result.params));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("label")}</p>
      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-protected route */}
          <img src={value} alt={t("label")} className="h-28 rounded-md border object-cover" />
          <Button type="button" size="icon" variant="secondary" className="absolute end-1 top-1 size-8" aria-label={t("remove")} onClick={() => onChange("")}>
            <XIcon className="size-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="h-11" onClick={() => input.current?.click()} disabled={busy}>
          <CameraIcon className="size-4" aria-hidden />
          {busy ? t("uploading") : t("add")}
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </div>
  );
}
