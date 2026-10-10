import { redirect } from "next/navigation";
import { requirePagePermission } from "@/server/auth/dal";

export default async function ReportsIndex() {
  await requirePagePermission("stock:view");
  redirect("/reports/stock-on-hand");
}
