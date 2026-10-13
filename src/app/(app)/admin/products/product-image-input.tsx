"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMessage } from "@/components/use-message";
import { resizeImage } from "@/lib/image-resize";
import { runAction } from "@/lib/run-action";
import { uploadProductImage } from "@/server/actions/product-images";

/** Upload a product photo: resized here to 800 px + a 240 px thumbnail, stored in the database. */
export function ProductImageInput({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const t = useTranslations("products");
  const message = useMessage();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const [full, thumb] = await Promise.all([resizeImage(file, 800), resizeImage(file, 240, 0.8)]);
      const fd = new FormData();
      fd.set("file", new File([full], "product.jpg", { type: "image/jpeg" }));
      fd.set("thumb", new File([thumb], "product-thumb.jpg", { type: "image/jpeg" }));
      // Not retried: a repeat would only leave an unused copy, but there's no need for one.
      const result = await runAction(() => uploadProductImage(fd));
      if (result.ok) onChange(result.data.url);
      else toast.error(message(result.error, result.params));
    } catch {
      toast.error(message("photo.errors.type"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- auth-protected route or external store URL
          <img src={value} alt={t("image")} className="size-full object-contain" />
        ) : (
          <ImagePlusIcon className="size-8 text-muted-foreground" aria-hidden />
        )}
        {value && (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute end-1 top-1 size-7"
            aria-label={t("removeImage")}
            onClick={() => onChange("")}
          >
            <XIcon className="size-4" aria-hidden />
          </Button>
        )}
      </div>
      <Button type="button" variant="outline" className="h-11" onClick={() => input.current?.click()} disabled={busy}>
        <ImagePlusIcon className="size-4" aria-hidden />
        {busy ? t("uploading") : value ? t("replaceImage") : t("uploadImage")}
      </Button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
