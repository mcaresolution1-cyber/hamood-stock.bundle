import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { ProductStatusName } from "@/lib/products";

/** Shown only for products that aren't Active (the text carries the meaning). */
export async function ProductStatusBadge({ status }: { status: ProductStatusName }) {
  if (status === "ACTIVE") return null;
  const t = await getTranslations("products.statuses");
  return <Badge variant={status === "INACTIVE" ? "secondary" : "outline"}>{t(status)}</Badge>;
}
