/** Which navigation links a role sees. Pure — the server still checks every page. */
import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";

export type NavKey = "dashboard" | "stockIn" | "stockOut" | "entries" | "products" | "warehouses" | "users" | "openingStock";
export type NavItem = { key: NavKey; href: string; section: "main" | "admin" };

const ITEMS: (NavItem & { show: (role: Role) => boolean })[] = [
  { key: "dashboard", href: "/", section: "main", show: () => true },
  { key: "stockIn", href: "/stock/in", section: "main", show: (r) => can(r, "entry:create") },
  { key: "stockOut", href: "/stock/out", section: "main", show: (r) => can(r, "entry:create") },
  { key: "entries", href: "/entries", section: "main", show: (r) => can(r, "stock:view") },
  { key: "products", href: "/admin/products", section: "admin", show: (r) => can(r, "product:manage") },
  { key: "openingStock", href: "/admin/opening-stock", section: "admin", show: (r) => can(r, "entry:correct") },
  { key: "warehouses", href: "/admin/warehouses", section: "admin", show: (r) => can(r, "warehouse:manage") },
  { key: "users", href: "/admin/users", section: "admin", show: (r) => can(r, "user:manage") },
];

export function navItemsFor(role: Role): NavItem[] {
  return ITEMS.filter((i) => i.show(role)).map(({ key, href, section }) => ({ key, href, section }));
}
