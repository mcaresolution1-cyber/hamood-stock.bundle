"use client";

import { useTranslations } from "next-intl";
import { ConfirmAction } from "@/components/confirm-action";
import { setProductActive } from "@/server/actions/products";

export function ProductActiveToggle({ id, modelCode, active }: { id: string; modelCode: string; active: boolean }) {
  const t = useTranslations();
  return (
    <ConfirmAction
      label={active ? t("common.deactivate") : t("common.activate")}
      title={active ? t("products.deactivateConfirm", { modelCode }) : t("products.activateConfirm", { modelCode })}
      action={() => setProductActive(id, !active)}
      destructive={active}
      variant="ghost"
    />
  );
}
