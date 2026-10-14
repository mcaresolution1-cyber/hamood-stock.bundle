/** Which navigation links a role sees. Pure — the server still checks every page. */
import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";

export type NavKey =
  | "dashboard"
  | "jobs"
  | "stockIn"
  | "stockOut"
  | "entries"
  | "reports"
  | "approvals"
  | "products"
  | "warehouses"
  | "users"
  | "openingStock"
  | "audit"
  | "settings";
export type NavItem = { key: NavKey; href: string; section: "main" | "admin" };

const ITEMS: (NavItem & { show: (role: Role) => boolean })[] = [
  { key: "dashboard", href: "/", section: "main", show: (r) => can(r, "stock:view") },
  { key: "jobs", href: "/jobs", section: "main", show: (r) => can(r, "job:own") },
  { key: "stockIn", href: "/stock/in", section: "main", show: (r) => can(r, "entry:create") },
  { key: "stockOut", href: "/stock/out", section: "main", show: (r) => can(r, "entry:create") },
  { key: "entries", href: "/entries", section: "main", show: (r) => can(r, "stock:view") },
  { key: "reports", href: "/reports", section: "main", show: (r) => can(r, "stock:view") },
  {
    key: "approvals",
    href: "/approvals",
    section: "main",
    show: (r) => can(r, "approval:decide") || can(r, "entry:correct") || can(r, "entry:void"),
  },
  { key: "products", href: "/admin/products", section: "admin", show: (r) => can(r, "product:manage") },
  { key: "openingStock", href: "/admin/opening-stock", section: "admin", show: (r) => can(r, "openingStock:import") },
  { key: "warehouses", href: "/admin/warehouses", section: "admin", show: (r) => can(r, "warehouse:manage") },
  { key: "users", href: "/admin/users", section: "admin", show: (r) => can(r, "user:manage") },
  { key: "audit", href: "/admin/audit", section: "admin", show: (r) => can(r, "audit:view") },
  { key: "settings", href: "/admin/settings", section: "admin", show: (r) => can(r, "settings:manage") },
];

export function navItemsFor(role: Role): NavItem[] {
  return ITEMS.filter((i) => i.show(role)).map(({ key, href, section }) => ({ key, href, section }));
}
