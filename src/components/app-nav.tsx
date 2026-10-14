"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  BarChart3Icon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FileUpIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  ListIcon,
  MenuIcon,
  PackageIcon,
  PackagePlusIcon,
  SettingsIcon,
  TagsIcon,
  TruckIcon,
  UsersIcon,
  WarehouseIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { activeNavKey, type NavItem, type NavKey, type NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<NavKey, LucideIcon> = {
  dashboard: LayoutDashboardIcon,
  jobs: WrenchIcon,
  stockIn: ArrowDownToLineIcon,
  stockOut: ArrowUpFromLineIcon,
  entries: ListIcon,
  reports: BarChart3Icon,
  approvals: ClipboardCheckIcon,
  products: PackageIcon,
  productsNew: PackagePlusIcon,
  productsImport: FileUpIcon,
  categories: TagsIcon,
  suppliers: TruckIcon,
  openingStock: ClipboardListIcon,
  warehouses: WarehouseIcon,
  users: UsersIcon,
  audit: HistoryIcon,
  settings: SettingsIcon,
};

const SECTIONS: NavSection[] = ["main", "catalog", "admin"];

/** The grouped links, used by the desktop sidebar and the phone menu. */
function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const active = activeNavKey(items, pathname);
  return (
    <div className="flex flex-col gap-5">
      {SECTIONS.map((section) => {
        const list = items.filter((i) => i.section === section);
        if (!list.length) return null;
        return (
          <div key={section} className="flex flex-col gap-0.5">
            {section !== "main" && (
              <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`sections.${section}`)}</p>
            )}
            {list.map((item) => {
              const Icon = ICONS[item.key];
              const current = item.key === active;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent md:min-h-9",
                    current ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{t(item.key)}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Fixed sidebar from md up, on the start side (left in English, right in Arabic). */
export function Sidebar({ items }: { items: NavItem[] }) {
  const t = useTranslations("common");
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-e bg-muted/30 md:flex">
      <Link href="/" className="flex h-14 shrink-0 items-center gap-2 border-b px-5 font-semibold">
        <WarehouseIcon className="size-5 shrink-0" aria-hidden />
        <span className="truncate">{t("appName")}</span>
      </Link>
      <nav aria-label={t("menu")} className="flex-1 overflow-y-auto p-3">
        <NavLinks items={items} />
      </nav>
    </aside>
  );
}

/** Menu button + slide-out panel with the same sections, below md (phones). */
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
      <SheetContent side={locale === "ar" ? "right" : "left"} className="w-72 gap-0">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <WarehouseIcon className="size-5" aria-hidden />
            {t("appName")}
          </SheetTitle>
        </SheetHeader>
        <nav className="overflow-y-auto p-3" aria-label={t("menu")}>
          <NavLinks items={items} onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
