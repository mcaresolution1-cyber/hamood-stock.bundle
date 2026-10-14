import type { NextRequest } from "next/server";
import { routeGuard } from "@/server/export/template";
import { movementsXlsx } from "@/server/export/reports";
import { parseEntryFilters } from "@/server/queries/entries";

export async function GET(req: NextRequest) {
  const denied = await routeGuard("stock:view");
  if (denied) return denied;
  // "Cost pending" is a cost-role filter (entries page only); never applied here.
  return movementsXlsx({ ...parseEntryFilters(Object.fromEntries(req.nextUrl.searchParams)), costPending: undefined });
}
