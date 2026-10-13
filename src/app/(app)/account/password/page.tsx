import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/server/auth/dal";
import { ChangePasswordForm } from "./change-password-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account"))("title") };
}

/** Every user's own password. Users who must change it are sent here by requireUser(). */
export default async function ChangePasswordPage() {
  const user = await requireUser({ allowPasswordChange: true });
  const t = await getTranslations("account");
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {user.mustChangePassword && (
        <p role="status" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {t("mustChange")}
        </p>
      )}
      <Card>
        <CardContent className="pt-6">
          <ChangePasswordForm email={user.email} mustChange={user.mustChangePassword} />
        </CardContent>
      </Card>
    </div>
  );
}
