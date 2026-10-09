import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/server/auth/dal";
import { activeWarehouseOptions } from "@/server/queries/warehouses";
import { OpeningStockForm } from "./opening-stock-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("openingStock"))("title") };
}

export default async function OpeningStockPage() {
  await requirePagePermission("entry:correct");
  const t = await getTranslations("openingStock");
  const warehouses = await activeWarehouseOptions();
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <OpeningStockForm warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} />
    </>
  );
}
