import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LogOutIcon, UserIcon, WarehouseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LanguageSwitch } from "@/components/language-switch";
import { DesktopNav, MobileNav } from "@/components/app-nav";
import { navItemsFor } from "@/lib/nav";
import { logoutAction } from "@/server/actions/auth";
import type { CurrentUser } from "@/server/auth/dal";

export async function TopBar({ user }: { user: CurrentUser }) {
  const t = await getTranslations();
  const nav = navItemsFor(user.role);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <MobileNav items={nav} />
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <WarehouseIcon className="size-5 shrink-0" aria-hidden />
          <span className="truncate font-semibold">{t("common.appName")}</span>
        </Link>
        <DesktopNav items={nav} />

        <div className="ms-auto flex items-center gap-2">
          <LanguageSwitch />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2" aria-label={t("topBar.openMenu")}>
                <UserIcon className="size-4" aria-hidden />
                <span className="hidden max-w-32 truncate sm:inline">{user.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="space-y-1 font-normal">
                <p className="text-xs text-muted-foreground">{t("topBar.signedInAs")}</p>
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">
                  {user.email}
                </p>
                <Badge variant="secondary">{t(`roles.${user.role}`)}</Badge>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <form action={logoutAction}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full">
                    <LogOutIcon className="size-4 rtl:rotate-180" aria-hidden />
                    {t("auth.logout")}
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
