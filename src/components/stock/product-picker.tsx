"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ProductThumb } from "@/components/product-thumb";
import { Ltr } from "@/components/ltr";
import type { FormProduct } from "@/server/queries/entry-form";

/**
 * Searchable product list (model code, English or Arabic name). When `available` is given (stock out),
 * the quantity in the chosen warehouse is shown and products with none are hidden.
 */
export function ProductPicker({
  products,
  available,
  onPick,
  disabled,
}: {
  products: FormProduct[];
  available?: Record<string, number>;
  onPick: (product: FormProduct) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("productPicker");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const list = available ? products.filter((p) => (available[p.id] ?? 0) > 0) : products;

  return (
    <>
      <Button type="button" variant="outline" className="h-12 w-full text-base" onClick={() => setOpen(true)} disabled={disabled}>
        <PlusIcon className="size-5" aria-hidden />
        {t("add")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-4 max-h-[calc(100dvh-2rem)] translate-y-0 gap-2 p-0 sm:top-[10%]">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>{t("title")}</DialogTitle>
          </DialogHeader>
          <Command className="rounded-none">
            <CommandInput placeholder={t("search")} className="h-12 text-base" autoFocus />
            <CommandList className="max-h-[60dvh]">
              <CommandEmpty>{available ? t("emptyOut") : t("empty")}</CommandEmpty>
              {list.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  keywords={[p.modelCode, p.nameEn, p.nameAr, p.variant ?? ""]}
                  onSelect={() => {
                    onPick(p);
                    setOpen(false);
                  }}
                  className="min-h-14 gap-3 px-3"
                >
                  <ProductThumb src={p.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <Ltr className="block font-medium">{p.modelCode}</Ltr>
                    <span className="block truncate text-sm text-muted-foreground">
                      {locale === "ar" ? p.nameAr : p.nameEn}
                      {p.variant ? ` · ${p.variant}` : ""}
                    </span>
                  </div>
                  {available && (
                    <span className="shrink-0 rounded bg-muted px-2 py-1 text-sm tabular-nums">
                      {t("available", { count: available[p.id] ?? 0 })}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
