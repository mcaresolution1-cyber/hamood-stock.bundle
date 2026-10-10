import { routeGuard, xlsxResponse } from "@/server/export/template";

export async function GET() {
  const denied = await routeGuard("product:manage");
  if (denied) return denied;
  return xlsxResponse(
    "products-template.xlsx",
    ["modelCode", "nameEn", "nameAr", "category", "variant", "imageUrl", "cost", "lowStockLevel"],
    [["HMD-772", "Full-motion TV wall mount 37–75″", "حامل تلفزيون جداري متحرك 37–75 بوصة", "wall-mount", "Black", "", "85.00", 10]],
  );
}
