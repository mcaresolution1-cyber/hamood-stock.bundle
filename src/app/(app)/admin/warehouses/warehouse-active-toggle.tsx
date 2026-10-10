"use client";

import { useTranslations } from "next-intl";
import { ConfirmAction } from "@/components/confirm-action";
import { setWarehouseActive } from "@/server/actions/warehouses";

export function WarehouseActiveToggle({ id, name, active }: { id: string; name: string; active: boolean }) {
  const t = useTranslations();
  return (
    <ConfirmAction
      label={active ? t("common.deactivate") : t("common.activate")}
      title={active ? t("warehouses.deactivateConfirm", { name }) : t("warehouses.activateConfirm", { name })}
      action={() => setWarehouseActive(id, !active)}
      destructive={active}
      variant="ghost"
    />
  );
}
