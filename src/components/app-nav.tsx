"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDownIcon, MenuIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Links({ items, onNavigate, vertical }: { items: NavItem[]; onNavigate?: () => void; vertical?: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const sections = (["main", "admin"] as const)
    .map((s) => ({ section: s, items: items.filter((i) => i.section === s) }))
    .filter((s) => s.items.length);

  return (
    <div className={cn(vertical ? "flex flex-col gap-4" : "flex items-center gap-1")}>
      {sections.map(({ section, items }) => (
        <div key={section} className={cn(vertical ? "flex flex-col gap-1" : "flex items-center gap-1")}>
          {vertical && section === "admin" && (
            <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("admin")}</p>
          )}
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent",
                vertical ? "py-3" : "py-2",
                isActive(pathname, item.href) ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              {t(item.key)}
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Top-level links (Dashboard, Stock in/out, Entries, Reports) + one "Admin" menu, from md up.
 * Labels never wrap; the admin pages live in the dropdown so the bar fits a laptop in EN and AR.
 */
export function DesktopNav({ items }: { items: NavItem[] }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const main = items.filter((i) => i.section === "main");
  const admin = items.filter((i) => i.section === "admin");
  const adminActive = admin.some((i) => isActive(pathname, i.href));
  const link = "whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors hover:bg-accent";
  return (
    <nav className="hidden md:block" aria-label={tc("menu")}>
      <div className="flex items-center gap-0.5">
        {main.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={cn(link, isActive(pathname, item.href) ? "bg-accent text-foreground" : "text-muted-foreground")}
          >
            {t(item.key)}
          </Link>
        ))}
        {admin.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(link, "inline-flex items-center gap-1", adminActive ? "bg-accent text-foreground" : "text-muted-foreground")}
            >
              {t("admin")}
              <ChevronDownIcon className="size-3.5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              {admin.map((item) => (
                <DropdownMenuItem key={item.key} asChild>
                  <Link href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
                    {t(item.key)}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </nav>
  );
}

/** Menu button + slide-out panel, shown below md (phones). */
export function MobileNav({ items }: { items: NavItem[] }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11 md:hidden" aria-label={t("menu")}>
            <MenuIcon className="size-5" aria-hidden />
          </Button>
        </SheetTrigger>
        {/* Slides in from the start edge: left in English, right in Arabic. */}
        <SheetContent side={locale === "ar" ? "right" : "left"} className="w-72">
          <SheetHeader>
            <SheetTitle>{t("menu")}</SheetTitle>
          </SheetHeader>
          <nav className="px-2" aria-label={t("menu")}>
            <Links items={items} vertical onNavigate={() => setOpen(false)} />
          </nav>
        </SheetContent>
    </Sheet>
  );
}
