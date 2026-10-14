import { PackageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumbSrc } from "@/lib/products";

/**
 * Product photo thumbnail. Uploaded images use their small size; external URLs (the store's own site)
 * are shown as they are. A plain <img>: next/image would need every host whitelisted.
 */
export function ProductThumb({ src, className }: { src?: string | null; className?: string }) {
  return (
    <div className={cn("flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- see component comment
        <img src={thumbSrc(src) ?? undefined} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <PackageIcon className="size-5 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}
