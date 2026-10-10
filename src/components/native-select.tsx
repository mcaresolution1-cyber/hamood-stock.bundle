import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A styled native <select>. Native selects give the best experience on phones (OS picker) and work
 * in plain GET filter forms without JavaScript.
 */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        className="h-11 md:h-10 w-full appearance-none rounded-md border border-input bg-transparent ps-3 pe-9 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive"
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}
