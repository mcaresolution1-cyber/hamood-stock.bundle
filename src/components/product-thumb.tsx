import { PackageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Product photo thumbnail. Uses a plain <img> because product images are arbitrary external URLs
 * (the store's own site); next/image would need every host whitelisted.
 */
export function ProductThumb({ src, className }: { src?: string | null; className?: string }) {
  return (
    <div className={cn("flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- see component comment
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <PackageIcon className="size-5 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}
