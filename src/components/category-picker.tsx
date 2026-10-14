"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMessage } from "@/components/use-message";
import { categoryName } from "@/lib/categories";
import { runAction } from "@/lib/run-action";
import { cn } from "@/lib/utils";
import { createCategory } from "@/server/actions/categories";

export type CategoryOption = { id: string; nameEn: string; nameAr: string; active?: boolean };

/**
 * Pick one or more categories (PU2). Tapping toggles; the first one picked is the main category and is
 * marked as such. "New category" adds one on the spot (ADMIN — the same people who edit products).
 */
export function CategoryPicker({
  options,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  options: CategoryOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations("categories");
  const locale = useLocale();
  const message = useMessage();
  const [list, setList] = useState(options);
  const [open, setOpen] = useState(false);
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  function add() {
    startTransition(async () => {
      const result = await runAction(() => createCategory({ nameEn, nameAr, position: String(list.length + 1) }));
      if (!result.ok) {
        toast.error(message(result.error, result.params));
        return;
      }
      setList((l) => [...l, result.data]);
      onChange([...value, result.data.id]);
      setNameEn("");
      setNameAr("");
      setOpen(false);
      toast.success(t("created"));
    });
  }

  return (
    <div className="space-y-2">
      <div role="group" aria-describedby={describedBy} className="flex flex-wrap gap-2">
        {list.map((c) => {
          const on = value.includes(c.id);
          const main = value[0] === c.id && value.length > 1;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(c.id)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors md:min-h-9",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                invalid && !value.length && "border-destructive",
              )}
            >
              {on && <CheckIcon className="size-4" aria-hidden />}
              <span>{categoryName(c, locale)}</span>
              {main && <span className="rounded bg-primary-foreground/20 px-1 text-xs">{t("main")}</span>}
              {c.active === false && <span className="text-xs opacity-70">({t("inactive")})</span>}
            </button>
          );
        })}
        <Button type="button" variant="outline" className="min-h-11 rounded-full md:min-h-9" onClick={() => setOpen(true)}>
          <PlusIcon className="size-4" aria-hidden />
          {t("new")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("new")}</DialogTitle>
            <DialogDescription>{t("newHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm">
              {t("nameEn")}
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" maxLength={100} />
            </label>
            <label className="grid gap-1 text-sm">
              {t("nameAr")}
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" lang="ar" maxLength={100} />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" onClick={add} disabled={pending || !nameEn.trim() || !nameAr.trim()}>
              {t("add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
