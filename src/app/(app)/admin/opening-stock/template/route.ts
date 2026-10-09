import { routeGuard, xlsxResponse } from "@/server/export/template";

export async function GET() {
  const denied = await routeGuard("entry:correct");
  if (denied) return denied;
  return xlsxResponse("opening-stock-template.xlsx", ["modelCode", "quantity"], [["HMD-772", 25], ["HMD-300", 40]]);
}
