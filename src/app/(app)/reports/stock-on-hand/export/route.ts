import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/dal";
import { routeGuard } from "@/server/export/template";
import { stockOnHandXlsx } from "@/server/export/reports";
import { isCategory } from "@/lib/products";

export async function GET(req: NextRequest) {
  const denied = await routeGuard("stock:view");
  if (denied) return denied;
  const user = (await getCurrentUser())!;
  const category = req.nextUrl.searchParams.get("category") ?? "";
  return stockOnHandXlsx(user, { category: isCategory(category) ? category : undefined });
}
