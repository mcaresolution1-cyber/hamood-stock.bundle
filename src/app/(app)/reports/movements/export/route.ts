import type { NextRequest } from "next/server";
import { routeGuard } from "@/server/export/template";
import { movementsXlsx } from "@/server/export/reports";
import { parseEntryFilters } from "@/server/queries/entries";

export async function GET(req: NextRequest) {
  const denied = await routeGuard("stock:view");
  if (denied) return denied;
  return movementsXlsx(parseEntryFilters(Object.fromEntries(req.nextUrl.searchParams)));
}
