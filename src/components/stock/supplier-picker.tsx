"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { PlusIcon, TruckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMessage } from "@/components/use-message";
import { runAction } from "@/lib/run-action";
import { quickAddSupplier, type SupplierOption } from "@/server/actions/suppliers";

export function supplierLabel(s: SupplierOption | undefined, locale: string): string {
  if (!s) return "";
  return locale === "ar" && s.nameAr ? s.nameAr : s.nameEn;
}

/**
 * Searchable supplier list for deliveries and returns, with "Add new supplier" (name + phone) for anyone
 * recording a delivery (decision PB3). Calls onChange with the chosen id; new suppliers are added to the list.
 */
export function SupplierPicker({
  suppliers,
  value,
  onChange,
  onAdded,
  error,
}: {
  suppliers: SupplierOption[];
  value: string;
  onChange: (id: string) => void;
  onAdded: (s: SupplierOption) => void;
  error?: string;
}) {
  const t = useTranslations("suppliers");
  const tc = useTranslations("common");
  const tf = useTranslations("entryForm");
  const locale = useLocale();
  const message = useMessage();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chosen = suppliers.find((s) => s.id === value);

  function add() {
    setAddError(null);
    startTransition(async () => {
      // Safe to retry: the same name returns the supplier already saved.
      const result = await runAction(() => quickAddSupplier({ nameEn: query, phone }), { retry: true });
      if (result.ok) {
        onAdded(result.data);
        onChange(result.data.id);
        toast.success(t("added"));
        setOpen(false);
        setAdding(false);
        setPhone("");
      } else setAddError(message(result.fieldErrors?.nameEn ?? result.fieldErrors?.phone ?? result.error, result.params));
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" aria-hidden>
        {tf("supplier")}
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full justify-start text-base"
        aria-label={`${tf("supplier")}: ${chosen ? supplierLabel(chosen, locale) : t("pick")}`}
        aria-invalid={Boolean(error)}
        onClick={() => {
          setAdding(false);
          setOpen(true);
        }}
      >
        <TruckIcon className="size-5" aria-hidden />
        <span className="truncate">{chosen ? supplierLabel(chosen, locale) : t("pick")}</span>
        {chosen && <span className="ms-auto text-sm text-muted-foreground">{t("change")}</span>}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {message(error)}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-4 max-h-[calc(100dvh-2rem)] translate-y-0 gap-2 p-0 sm:top-[10%]">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>{adding ? t("addTitle") : t("pick")}</DialogTitle>
          </DialogHeader>
          {adding ? (
            <div className="space-y-3 p-4 pt-2">
              <label className="grid gap-1 text-sm font-medium">
                {t("nameEn")}
                <Input value={query} onChange={(e) => setQuery(e.target.value)} className="h-11" autoFocus />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                <span>
                  {t("phone")} <span className="font-normal text-muted-foreground">({tc("optional")})</span>
                </span>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" className="h-11" />
              </label>
              {addError && (
                <p role="alert" className="text-sm text-destructive">
                  {addError}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setAdding(false)}>
                  {tc("back")}
                </Button>
                <Button type="button" className="h-11 flex-[2]" onClick={add} disabled={pending || !query.trim()}>
                  {pending ? tc("saving") : tc("save")}
                </Button>
              </div>
            </div>
          ) : (
            <Command className="rounded-none">
              <CommandInput placeholder={t("search")} className="h-12 text-base" value={query} onValueChange={setQuery} autoFocus />
              <CommandList className="max-h-[55dvh]">
                <CommandEmpty>{t("none")}</CommandEmpty>
                {suppliers.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.id}
                    keywords={[s.nameEn, s.nameAr ?? ""]}
                    onSelect={() => {
                      onChange(s.id);
                      setOpen(false);
                    }}
                    className="min-h-12 px-3"
                  >
                    <bdi>{supplierLabel(s, locale)}</bdi>
                    {locale === "ar" && s.nameAr && <bdi className="ms-auto text-xs text-muted-foreground">{s.nameEn}</bdi>}
                  </CommandItem>
                ))}
              </CommandList>
              <div className="border-t p-2">
                <Button type="button" variant="ghost" className="h-12 w-full justify-start" onClick={() => setAdding(true)}>
                  <PlusIcon className="size-4" aria-hidden />
                  {t("addNew")}
                </Button>
              </div>
            </Command>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
