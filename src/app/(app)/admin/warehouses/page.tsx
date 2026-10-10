import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { MobileCard, ResponsiveList } from "@/components/mobile-list";
import { requirePagePermission } from "@/server/auth/dal";
import { listWarehouses } from "@/server/queries/warehouses";
import { WarehouseDialog } from "./warehouse-dialog";
import { WarehouseActiveToggle } from "./warehouse-active-toggle";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("warehouses"))("title") };
}

export default async function WarehousesPage() {
  await requirePagePermission("warehouse:manage");
  const [t, tc, tk] = await Promise.all([
    getTranslations("warehouses"),
    getTranslations("common"),
    getTranslations("warehouseKinds"),
  ]);
  const warehouses = await listWarehouses();

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} actions={<WarehouseDialog />} />
      {warehouses.length === 0 ? (
        <EmptyState message={t("empty")} />
      ) : (
        <ResponsiveList
          cards={warehouses.map((w) => (
            <MobileCard key={w.id} muted={!w.active}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{w.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {w.city} · {w.active ? tc("active") : tc("inactive")}
                  </p>
                </div>
                <Badge variant={w.kind === "DAMAGED" ? "destructive" : "secondary"}>{tk(w.kind)}</Badge>
              </div>
              <p className="mt-1 text-sm">
                {t("stock")}: <span className="tabular-nums">{w.units}</span>
              </p>
              <div className="mt-2 flex justify-end gap-1 border-t pt-2">
                <WarehouseDialog warehouse={{ id: w.id, name: w.name, city: w.city, kind: w.kind }} />
                <WarehouseActiveToggle id={w.id} name={w.name} active={w.active} />
              </div>
            </MobileCard>
          ))}
          table={
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("name")}</TableHead>
                    <TableHead>{t("city")}</TableHead>
                    <TableHead>{t("kind")}</TableHead>
                    <TableHead className="text-end">{t("stock")}</TableHead>
                    <TableHead>{tc("status")}</TableHead>
                    <TableHead className="text-end">{tc("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.map((w) => (
                    <TableRow key={w.id} className={w.active ? "" : "text-muted-foreground"}>
                      <TableCell className="font-medium">{w.name}</TableCell>
                      <TableCell>{w.city}</TableCell>
                      <TableCell>
                        <Badge variant={w.kind === "DAMAGED" ? "destructive" : "secondary"}>{tk(w.kind)}</Badge>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{w.units}</TableCell>
                      <TableCell>{w.active ? tc("active") : tc("inactive")}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <WarehouseDialog warehouse={{ id: w.id, name: w.name, city: w.city, kind: w.kind }} />
                          <WarehouseActiveToggle id={w.id} name={w.name} active={w.active} />
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
