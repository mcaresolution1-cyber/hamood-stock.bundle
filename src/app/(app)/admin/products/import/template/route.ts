import { routeGuard, xlsxResponse } from "@/server/export/template";
import { PRODUCT_TEMPLATE_HEADERS } from "@/lib/import/products";

/** An example file: the main details first (plan import-sku); every other column may be removed. */
export async function GET() {
  const denied = await routeGuard("product:manage");
  if (denied) return denied;
  return xlsxResponse(
    "products-template.xlsx",
    [...PRODUCT_TEMPLATE_HEADERS],
    [
      [
        "Full-motion TV wall mount 37–75″",
        "حامل تلفزيون جداري متحرك 37–75 بوصة",
        "HMD-772",
        "",
        "TV wall mounts, Floor stands",
        "199.00",
        12,
        "Riyadh Main",
        "https://hamoodtv.com/wp-content/uploads/hmd-772.jpg",
        "85.00",
        "6281234567890",
        "37–75″",
        "Black",
        45,
        "600×400",
        "",
        10,
        14,
        "",
        "",
        "",
      ],
    ],
  );
}
