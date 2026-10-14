import type { NextRequest } from "next/server";
import { routeGuard } from "@/server/export/template";
import { lowStockXlsx } from "@/server/export/reports";
import { parseCategoryParam } from "@/server/queries/categories";

export async function GET(req: NextRequest) {
  const denied = await routeGuard("stock:view");
  if (denied) return denied;
  const category = await parseCategoryParam(req.nextUrl.searchParams.get("category"));
  return lowStockXlsx({ category });
}
