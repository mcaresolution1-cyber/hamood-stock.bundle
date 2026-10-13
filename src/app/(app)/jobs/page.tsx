import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { requirePagePermission } from "@/server/auth/dal";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("jobs"))("title") };
}

/** A technician's installation jobs. The jobs themselves arrive in v2 Phase C. */
export default async function JobsPage() {
  await requirePagePermission("job:own");
  const t = await getTranslations("jobs");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <EmptyState message={t("empty")} />
    </>
  );
}
