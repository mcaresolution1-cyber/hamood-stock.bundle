/* eslint-disable @next/next/no-img-element -- a small static SVG; next/image adds nothing here */
import { cn } from "@/lib/utils";

/**
 * The Hamood TV logo from /public/brand/logo.svg (plan ux-dashboard-report, PX5). The file there is a
 * placeholder until the real logo is supplied — replacing the file is all that's needed.
 */
export function BrandLogo({ className }: { className?: string }) {
  return <img src="/brand/logo.svg" alt="" aria-hidden width={32} height={32} className={cn("shrink-0 rounded-md", className)} />;
}
