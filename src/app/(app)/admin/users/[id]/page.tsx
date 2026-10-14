import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronLeftIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Ltr } from "@/components/ltr";
import { requirePagePermission } from "@/server/auth/dal";
import { userWithLogins } from "@/server/queries/users";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("users"))("loginHistory") };
}

/** One user's sign-in history (ADMIN). */
export default async function UserLoginsPage({ params }: PageProps<"/admin/users/[id]">) {
  await requirePagePermission("user:manage");
  const { id } = await params;
  const [t, tr, format, user] = await Promise.all([getTranslations("users"), getTranslations("roles"), getFormatter(), userWithLogins(id)]);
  if (!user) notFound();
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "medium" });

  return (
    <>
      <Link href="/admin/users" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
        {t("backToUsers")}
      </Link>
      <PageHeader title={user.name} description={t("loginHistorySubtitle")} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Ltr className="text-muted-foreground">{user.email}</Ltr>
        <Badge variant="secondary">{tr(user.role)}</Badge>
        {user.mustChangePassword && <Badge variant="outline">{t("mustChange")}</Badge>}
      </div>
      {user.loginEvents.length === 0 ? (
        <EmptyState message={t("loginEmpty")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("when")}</TableHead>
                <TableHead>{t("result")}</TableHead>
                <TableHead>{t("ip")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user.loginEvents.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{when(e.at)}</TableCell>
                  <TableCell className={e.success ? "" : "text-destructive"}>
                    {e.success ? t("loginOk") : t(`loginReasons.${(e.reason ?? "password") as "password"}`)}
                  </TableCell>
                  <TableCell>
                    <Ltr>{e.ip ?? "—"}</Ltr>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
