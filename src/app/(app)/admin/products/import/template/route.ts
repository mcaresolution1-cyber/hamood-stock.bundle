import { routeGuard, xlsxResponse } from "@/server/export/template";
import { PRODUCT_TEMPLATE_HEADERS } from "@/lib/import/products";

export async function GET() {
  const denied = await routeGuard("product:manage");
  if (denied) return denied;
  return xlsxResponse(
    "products-template.xlsx",
    [...PRODUCT_TEMPLATE_HEADERS],
    [
      [
        "HMD-772",
        "HMD-772",
        "6281234567890",
        "Full-motion TV wall mount 37–75″",
        "حامل تلفزيون جداري متحرك 37–75 بوصة",
        "wall-mount",
        "37–75″",
        "Black",
        45,
        "600×400",
        "",
        "",
        "85.00",
        "199.00",
        10,
        14,
        "",
        "",
        "",
      ],
    ],
  );
}
