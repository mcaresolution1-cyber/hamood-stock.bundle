import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PackageIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/dal";
import { DeniedToast } from "@/components/denied-toast";
import { Suspense } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  // Pages re-check the user themselves: layouts are not re-rendered on every navigation.
  const user = await requireUser();
  const t = await getTranslations("dashboard");

  return (
    <div className="space-y-6">
      <Suspense>
        <DeniedToast />
      </Suspense>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("welcome", { name: user.name })}</p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="items-center text-center">
          <PackageIcon className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <CardTitle className="sr-only">{t("title")}</CardTitle>
          <CardDescription>{t("empty")}</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
