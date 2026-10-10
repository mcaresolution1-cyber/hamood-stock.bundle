"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ProductThumb } from "@/components/product-thumb";
import { Ltr } from "@/components/ltr";

type Item = { id: string; modelCode: string; nameEn: string; nameAr: string; variant: string | null; imageUrl: string | null; active: boolean; sellable: number };

/** Type-ahead product search; choosing a product opens its stock page. Results appear once you type. */
export function ProductSearch({ products }: { products: Item[] }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  return (
    <Command className="rounded-lg border" filter={(value, search, keywords) => {
      const q = search.trim().toLowerCase();
      if (!q) return 0;
      return [value, ...(keywords ?? [])].some((k) => k.toLowerCase().includes(q)) ? 1 : 0;
    }}>
      <CommandInput placeholder={t("searchPlaceholder")} className="h-12 text-base" value={query} onValueChange={setQuery} />
      {/* Results only once something is typed — the dashboard stays short on phones. */}
      <CommandList className={query.trim() ? "max-h-80" : "hidden"}>
        <CommandEmpty>{t("searchEmpty")}</CommandEmpty>
        {products.map((p) => (
          <CommandItem
            key={p.id}
            value={p.modelCode}
            keywords={[p.nameEn, p.nameAr, p.variant ?? ""]}
            onSelect={() => router.push(`/products/${p.id}`)}
            className="min-h-14 gap-3 px-3"
          >
            <ProductThumb src={p.imageUrl} />
            <div className="min-w-0 flex-1">
              <Ltr className="block font-medium">{p.modelCode}</Ltr>
              <span className="block truncate text-sm text-muted-foreground">{locale === "ar" ? p.nameAr : p.nameEn}</span>
            </div>
            <span className="shrink-0 rounded bg-muted px-2 py-1 text-sm tabular-nums">{t("sellable", { count: p.sellable })}</span>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}
