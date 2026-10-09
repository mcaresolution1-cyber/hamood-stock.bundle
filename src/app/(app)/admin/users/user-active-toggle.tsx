"use client";

import { useTranslations } from "next-intl";
import { ConfirmAction } from "@/components/confirm-action";
import { setUserActive } from "@/server/actions/users";

export function UserActiveToggle({ id, name, active }: { id: string; name: string; active: boolean }) {
  const t = useTranslations();
  return (
    <ConfirmAction
      label={active ? t("common.deactivate") : t("common.activate")}
      title={active ? t("users.deactivateConfirm", { name }) : t("users.activateConfirm", { name })}
      action={() => setUserActive(id, !active)}
      destructive={active}
      variant="ghost"
    />
  );
}
