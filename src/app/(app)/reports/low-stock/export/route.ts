import type { NextRequest } from "next/server";
import { routeGuard } from "@/server/export/template";
import { lowStockXlsx } from "@/server/export/reports";
import { isCategory } from "@/lib/products";

export async function GET(req: NextRequest) {
  const denied = await routeGuard("stock:view");
  if (denied) return denied;
  const category = req.nextUrl.searchParams.get("category") ?? "";
  return lowStockXlsx({ category: isCategory(category) ? category : undefined });
}
