"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

/** Shows "no access" once when a page redirected here with ?denied=1, then cleans the URL. */
export function DeniedToast() {
  const t = useTranslations("errors");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const denied = params.get("denied") === "1";

  useEffect(() => {
    if (!denied) return;
    toast.error(t("denied"), { id: "denied" }); // fixed id: never shown twice
    router.replace(pathname);
  }, [denied, t, router, pathname]);

  return null;
}
