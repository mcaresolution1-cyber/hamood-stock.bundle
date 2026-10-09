import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { MobileCard, ResponsiveList } from "@/components/mobile-list";
import { Ltr } from "@/components/ltr";
import { requirePagePermission } from "@/server/auth/dal";
import { listUsers } from "@/server/queries/users";
import { activeWarehouseOptions } from "@/server/queries/warehouses";
import { UserDialog } from "./user-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { UserActiveToggle } from "./user-active-toggle";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("users"))("title") };
}

export default async function UsersPage() {
  const me = await requirePagePermission("user:manage");
  const [t, tc, tr] = await Promise.all([getTranslations("users"), getTranslations("common"), getTranslations("roles")]);
  const [users, warehouses, locale] = await Promise.all([listUsers(), activeWarehouseOptions(), getLocale()]);
  const list = new Intl.ListFormat(locale, { style: "short", type: "conjunction" });
  const warehouseOptions = warehouses.map((w) => ({ id: w.id, name: w.name }));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={<UserDialog warehouses={warehouseOptions} />}
      />
      {users.length === 0 ? (
        <EmptyState message={t("empty")} />
      ) : (
        <ResponsiveList
          cards={users.map((u) => (
            <MobileCard key={u.id} muted={!u.active}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {u.name}
                    {u.id === me.id && <span className="text-muted-foreground"> ({t("you")})</span>}
                  </p>
                  <Ltr className="block truncate text-xs text-muted-foreground">{u.email}</Ltr>
                </div>
                <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>{tr(u.role)}</Badge>
              </div>
              <p className="mt-1 text-sm">
                {u.role === "STAFF"
                  ? u.warehouses.length
                    ? list.format(u.warehouses.map((w) => w.name))
                    : t("noWarehouses")
                  : t("allWarehouses")}
                {" · "}
                {u.active ? tc("active") : tc("inactive")}
              </p>
              <div className="mt-2 flex flex-wrap justify-end gap-1 border-t pt-2">
                <UserDialog
                  warehouses={warehouseOptions}
                  user={{ id: u.id, name: u.name, email: u.email, role: u.role, warehouseIds: u.warehouses.map((w) => w.id) }}
                />
                <ResetPasswordDialog id={u.id} name={u.name} />
                {u.id !== me.id && <UserActiveToggle id={u.id} name={u.name} active={u.active} />}
              </div>
            </MobileCard>
          ))}
          table={
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("name")}</TableHead>
                    <TableHead>{t("role")}</TableHead>
                    <TableHead>{t("warehouses")}</TableHead>
                    <TableHead>{tc("status")}</TableHead>
                    <TableHead className="text-end">{tc("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} className={u.active ? "" : "text-muted-foreground"}>
                      <TableCell>
                        <div className="font-medium">
                          {u.name}
                          {u.id === me.id && <span className="text-muted-foreground"> ({t("you")})</span>}
                        </div>
                        <Ltr className="block text-xs text-muted-foreground">{u.email}</Ltr>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>{tr(u.role)}</Badge>
                      </TableCell>
                      <TableCell className="max-w-56 whitespace-normal text-sm">
                        {u.role === "STAFF"
                          ? u.warehouses.length
                            ? list.format(u.warehouses.map((w) => w.name))
                            : t("noWarehouses")
                          : t("allWarehouses")}
                      </TableCell>
                      <TableCell>{u.active ? tc("active") : tc("inactive")}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <UserDialog
                            warehouses={warehouseOptions}
                            user={{
                              id: u.id,
                              name: u.name,
                              email: u.email,
                              role: u.role,
                              warehouseIds: u.warehouses.map((w) => w.id),
                            }}
                          />
                          <ResetPasswordDialog id={u.id} name={u.name} />
                          {u.id !== me.id && <UserActiveToggle id={u.id} name={u.name} active={u.active} />}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          }
        />
      )}
    </>
  );
}
