import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { CATEGORIES } from "@/lib/products";

export async function CategoryFilter({ value }: { value?: string }) {
  const t = await getTranslations();
  return (
    <form method="get" className="mb-3 flex gap-2">
      <NativeSelect name="category" defaultValue={value ?? ""} aria-label={t("reports.category")} className="flex-1 sm:max-w-64">
        <option value="">{t("reports.allCategories")}</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(`categories.${c}`)}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" variant="secondary" className="h-10">
        {t("reports.apply")}
      </Button>
    </form>
  );
}
