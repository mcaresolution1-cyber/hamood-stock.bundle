import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { WarehouseIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitch } from "@/components/language-switch";
import { getCurrentUser } from "@/server/auth/dal";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("title") };
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations();

  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <div className="flex justify-end p-4">
        <LanguageSwitch />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pt-8 sm:items-center sm:pt-0">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <WarehouseIcon className="size-5" aria-hidden />
            </div>
            <CardTitle className="text-xl">{t("common.appName")}</CardTitle>
            <CardDescription>{t("auth.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
