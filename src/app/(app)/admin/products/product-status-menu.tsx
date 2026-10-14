"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMessage } from "@/components/use-message";
import { PRODUCT_STATUSES, type ProductStatusName } from "@/lib/products";
import { runAction } from "@/lib/run-action";
import { setProductStatus } from "@/server/actions/products";

/** "Change status" menu on the products list; asks before changing (decision PB1). */
export function ProductStatusMenu({ id, modelCode, status }: { id: string; modelCode: string; status: ProductStatusName }) {
  const t = useTranslations();
  const message = useMessage();
  const router = useRouter();
  const [target, setTarget] = useState<ProductStatusName | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!target) return;
    startTransition(async () => {
      const result = await runAction(() => setProductStatus(id, target), { retry: true }); // same status twice = no change
      if (result.ok) {
        toast.success(t("common.saved"));
        setTarget(null);
        router.refresh();
      } else toast.error(message(result.error, result.params));
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            {t("products.setStatus")}
            <ChevronDownIcon className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {PRODUCT_STATUSES.filter((s) => s !== status).map((s) => (
            <DropdownMenuItem key={s} onSelect={() => setTarget(s)}>
              {t(`products.statuses.${s}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target && t("products.statusConfirm", { modelCode, status: t(`products.statuses.${target}`) })}</DialogTitle>
            {target && <DialogDescription>{t(`products.statusHelp.${target}`)}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("common.cancel")}</Button>
            </DialogClose>
            <Button onClick={run} disabled={pending} variant={target === "INACTIVE" ? "destructive" : "default"}>
              {pending ? t("common.saving") : t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
