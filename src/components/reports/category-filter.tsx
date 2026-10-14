import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { categoryName } from "@/lib/categories";
import { categoryOptions } from "@/server/queries/categories";

export async function CategoryFilter({ value }: { value?: string }) {
  const [t, locale, options] = await Promise.all([getTranslations(), getLocale(), categoryOptions(value ? [value] : [])]);
  return (
    <form method="get" className="mb-3 flex gap-2">
      <NativeSelect name="category" defaultValue={value ?? ""} aria-label={t("reports.category")} className="flex-1 sm:max-w-64">
        <option value="">{t("reports.allCategories")}</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {categoryName(c, locale)}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" variant="secondary" className="h-11 md:h-10">
        {t("reports.apply")}
      </Button>
    </form>
  );
}
