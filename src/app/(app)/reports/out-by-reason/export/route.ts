import type { NextRequest } from "next/server";
import { routeGuard } from "@/server/export/template";
import { outByReasonXlsx } from "@/server/export/reports";

export async function GET(req: NextRequest) {
  const denied = await routeGuard("stock:view");
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  return outByReasonXlsx({
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    warehouseId: sp.get("warehouseId") || undefined,
  });
}
