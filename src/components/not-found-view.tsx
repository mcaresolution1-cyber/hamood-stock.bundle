import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export async function NotFoundView() {
  const t = await getTranslations("states");
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <SearchXIcon className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("notFoundBody")}</p>
      <Button variant="outline" asChild>
        <Link href="/">{t("home")}</Link>
      </Button>
    </div>
  );
}
