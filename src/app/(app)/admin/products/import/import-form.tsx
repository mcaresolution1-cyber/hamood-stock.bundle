"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeftIcon, CheckCircle2Icon, DownloadIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilePicker } from "@/components/file-picker";
import { NativeSelect } from "@/components/native-select";
import { useMessage } from "@/components/use-message";
import { Ltr } from "@/components/ltr";
import { categoryMatchKey, categoryName } from "@/lib/categories";
import { KEY_FIELDS, mappingProblems, type ColumnMapping, type ImportField } from "@/lib/import/columns";
import { NEW_CATEGORY, PRODUCT_IMPORT_COLUMNS, type ProductImportRow } from "@/lib/import/products";
import {
  applyProductImport,
  previewProductImport,
  readProductImportColumns,
  type ImportColumns,
  type ImportPreview,
} from "@/server/actions/product-import";
import { runAction } from "@/lib/run-action";
import { cn } from "@/lib/utils";

const BADGE = { create: "default", update: "secondary", merged: "outline", error: "destructive" } as const;
const ACTION_LABEL = { create: "actionCreate", update: "actionUpdate", merged: "actionMerged", error: "actionError" } as const;
/** Choice value meaning "create a warehouse with the file's name" (server: NEW_WAREHOUSE). */
const NEW_WAREHOUSE = "new";
/** Rows shown in the check table; the rest are summarised (a 400-row table helps nobody). */
const SHOW_ROWS = 300;

/**
 * Product import (plans ui-menu-import-categories PU3, import-sku): choose a file → match its columns
 * (suggested automatically, editable) and see the first rows → check every row, choose where stock goes
 * and the category for products without one → import.
 */
export function ImportForm() {
  const t = useTranslations("import");
  const tp = useTranslations("products");
  const locale = useLocale();
  const message = useMessage();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<ImportColumns | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [defaultCategory, setDefaultCategory] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"read" | "check" | "apply" | null>(null);
  const latest = useRef<File | null>(null);

  const fieldLabel = (f: ImportField) => t(`fields.${f}`);
  const problems = useMemo(() => mappingProblems(mapping), [mapping]);
  const mapped = useMemo(
    () => Object.entries(mapping).filter((e): e is [string, ImportField] => Boolean(e[1])).map(([col, field]) => ({ col: Number(col), field })),
    [mapping],
  );
  // The owner's key details first, then everything else (plan import-sku).
  const fieldOrder = useMemo(() => [...KEY_FIELDS, ...PRODUCT_IMPORT_COLUMNS.filter((f) => !KEY_FIELDS.includes(f))], []);

  const formData = (category = defaultCategory) => {
    const fd = new FormData();
    if (file) fd.set("file", file);
    fd.set("mapping", JSON.stringify(mapping));
    fd.set("defaultCategory", category);
    fd.set("locations", JSON.stringify(locations));
    return fd;
  };

  function choose(f: File | null) {
    latest.current = f;
    setFile(f);
    setColumns(null);
    setPreview(null);
    if (!f) return;
    setBusy("read");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", f);
      const result = await runAction(() => readProductImportColumns(fd), { retry: true });
      if (latest.current !== f) return; // another file was chosen meanwhile
      if (result.ok) {
        setColumns(result.data);
        setMapping(result.data.mapping);
      } else toast.error(message(result.error, result.params));
    });
  }

  function pick(col: number, field: ImportField | "") {
    setPreview(null);
    setMapping((m) => {
      const next = { ...m };
      // A field belongs to one column: picking it here clears it elsewhere.
      if (field) for (const k of Object.keys(next)) if (next[k] === field) next[k] = "";
      next[String(col)] = field;
      return next;
    });
  }

  function check(category = defaultCategory) {
    setBusy("check");
    startTransition(async () => {
      const result = await runAction(() => previewProductImport(formData(category)), { retry: true });
      if (result.ok) {
        setPreview(result.data);
        // Keep what the user already chose for a warehouse label; suggest only for new labels.
        setLocations((prev) => {
          const next = { ...result.data.stock.suggested };
          for (const label of Object.keys(next)) if (label in prev) next[label] = prev[label];
          return next;
        });
      } else {
        setPreview(null);
        toast.error(message(result.error, result.params));
      }
    });
  }

  /** The rows with errors as .xlsx, in the file's own columns (the server re-validates it). */
  async function downloadErrors() {
    try {
      const res = await fetch("/admin/products/import/errors", { method: "POST", body: formData() });
      if (!res.ok) {
        toast.error(res.status === 400 ? await res.text() : message("errors.generic"));
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "import-errors.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(message("errors.network"));
    }
  }

  function apply() {
    setBusy("apply");
    startTransition(async () => {
      const result = await runAction(() => applyProductImport(formData())); // never retried: it writes products
      if (result.ok) {
        const d = result.data;
        toast.success(t("done", { created: d.created, updated: d.updated, categories: d.categories, entries: d.entries.length }));
        router.push("/admin/products");
        router.refresh();
      } else toast.error(message(result.error, result.params));
    });
  }

  const missingWarehouse = preview?.locations.some((l) => !l.label && locations[l.label] === NEW_WAREHOUSE) ?? false;
  const ready = preview && !preview.fileErrors.length && preview.counts.error === 0 && preview.rows.length > 0 && !missingWarehouse;
  const categoriesOf = (ids: string[] | undefined) =>
    (ids ?? [])
      .map((id) =>
        id.startsWith(NEW_CATEGORY)
          ? (preview?.newCategories.find((n) => categoryMatchKey(n) === id.slice(NEW_CATEGORY.length)) ?? id.slice(NEW_CATEGORY.length))
          : preview?.categoryNames[id]
            ? categoryName(preview.categoryNames[id], locale)
            : id,
      )
      .join(" · ");
  const stockOf = (r: ProductImportRow) => (r.data.stock ?? []).reduce((s, x) => s + x.quantity, 0);
  const notes = (r: ProductImportRow) => {
    const label = (field: string) => (t.has(`fields.${field.toLowerCase()}` as "fields.cost") ? t(`fields.${field.toLowerCase()}` as "fields.cost") : field);
    return [
      ...r.errors.map((e) => ({ tone: "error" as const, text: `${label(e.field)}: ${message(e.key)}` })),
      ...(r.mergedInto ? [{ tone: "info" as const, text: t("mergedInto", { row: r.mergedInto }) }] : []),
      ...r.warnings.map((w) => ({ tone: "warn" as const, text: `${label(w.field)}: ${message(w.key)}` })),
    ];
  };
  const rows = preview ? (onlyProblems ? preview.rows.filter((r) => r.errors.length || r.warnings.length) : preview.rows) : [];

  return (
    <div className="space-y-4">
      {/* Step 1 — file */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("step1")}</CardTitle>
          <CardDescription>{t("step1Help")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FilePicker label={t("file")} buttonLabel={t("chooseFile")} accept=".xlsx,.csv,.txt" file={file} onChange={choose} />
          {pending && busy === "read" && <p className="text-sm text-muted-foreground">{t("reading")}</p>}
          <Button variant="link" size="sm" className="h-auto px-0" asChild>
            <a href="/admin/products/import/template" download>
              <DownloadIcon className="size-4" aria-hidden />
              {t("template")}
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Step 2 — columns */}
      {columns && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("step2")}</CardTitle>
            <CardDescription>{t("step2Help", { count: columns.rowCount })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y rounded-md border">
              {columns.columns.map((c) => {
                const field = mapping[String(c.index)] ?? "";
                const samples = c.samples.map((s) => s.trim()).filter(Boolean);
                return (
                  <li key={c.index} className={cn("grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center", !field && "bg-muted/30")}>
                    <div className="min-w-0">
                      <p className={cn("font-medium", !field && "text-muted-foreground")}>
                        <bdi>{c.label || t("noHeader", { n: c.index + 1 })}</bdi>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {samples.length
                          ? samples.slice(0, 3).map((s, i) => (
                              <span key={i}>
                                {i > 0 && " · "}
                                <bdi>{s.length > 40 ? `${s.slice(0, 40)}…` : s}</bdi>
                              </span>
                            ))
                          : t("emptyColumn")}
                      </p>
                    </div>
                    <NativeSelect
                      aria-label={t("fieldFor", { column: c.label || String(c.index + 1) })}
                      value={field}
                      onChange={(e) => pick(c.index, e.target.value as ImportField | "")}
                      className={cn(field ? "" : "text-muted-foreground")}
                    >
                      <option value="">{t("skipColumn")}</option>
                      <optgroup label={t("keyFields")}>
                        {fieldOrder.slice(0, KEY_FIELDS.length).map((f) => (
                          <option key={f} value={f}>
                            {fieldLabel(f)}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label={t("moreFields")}>
                        {fieldOrder.slice(KEY_FIELDS.length).map((f) => (
                          <option key={f} value={f}>
                            {fieldLabel(f)}
                          </option>
                        ))}
                      </optgroup>
                    </NativeSelect>
                  </li>
                );
              })}
            </ul>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t("skuNote")}
            </p>
            {problems.noIdentity ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("needName")}
              </p>
            ) : (
              problems.noName && (
                <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t("noNameColumn")}
                </p>
              )
            )}

            {mapped.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("firstRows")}</p>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {mapped.map((m) => (
                          <TableHead key={m.col} className="whitespace-nowrap">
                            {fieldLabel(m.field)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {columns.columns[0].samples.map((_, r) => (
                        <TableRow key={r}>
                          {mapped.map((m) => (
                            <TableCell key={m.col} className="max-w-56 truncate">
                              <bdi>{columns.columns[m.col]?.samples[r] ?? ""}</bdi>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <Button onClick={() => check()} disabled={pending || problems.noIdentity} className="h-11">
              {pending && busy === "check" ? t("checking") : t("preview", { count: columns.rowCount })}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — result of the check, choices, then import */}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("step3")}</CardTitle>
            <CardDescription>
              {t("summary", preview.counts)}
              {preview.ignoredRows > 0 && <> · {t("ignoredRows", { count: preview.ignoredRows })}</>}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {preview.fileErrors.map((e) => (
              <p key={e} role="alert" className="text-sm text-destructive">
                {message(e)}
              </p>
            ))}

            {/* Where the stock goes (new products only) */}
            {preview.locations.length > 0 && (
              <section className="space-y-2 rounded-md border p-3">
                <h3 className="text-sm font-medium">{t("stockTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("stockHelp")}</p>
                <ul className="divide-y">
                  {preview.locations.map((l) => (
                    <li key={l.label} className="grid gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-center">
                      <p className="text-sm">
                        <span className="font-medium">
                          <bdi>{l.label || t("noWarehouseColumn")}</bdi>
                        </span>
                        <span className="block text-xs text-muted-foreground">{t("locationTotals", { products: l.products, units: l.units })}</span>
                      </p>
                      <NativeSelect
                        aria-label={t("warehouseFor", { location: l.label || t("noWarehouseColumn") })}
                        value={locations[l.label] ?? ""}
                        onChange={(e) => setLocations((m) => ({ ...m, [l.label]: e.target.value }))}
                      >
                        {l.label && <option value={NEW_WAREHOUSE}>{t("newWarehouse", { name: l.label })}</option>}
                        {!l.label && <option value={NEW_WAREHOUSE}>{t("chooseWarehouse")}</option>}
                        {preview.stock.warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                        <option value="">{t("skipStock")}</option>
                      </NativeSelect>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">{t("stockEntryNote")}</p>
              </section>
            )}

            {/* Category for products without one */}
            {preview.defaulted > 0 && (
              <section className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-center">
                <p className="text-sm">
                  <span className="font-medium">{t("noCategoryTitle", { count: preview.defaulted })}</span>
                  <span className="block text-xs text-muted-foreground">{t("noCategoryHelp")}</span>
                </p>
                <NativeSelect
                  aria-label={t("noCategoryTitle", { count: preview.defaulted })}
                  value={defaultCategory}
                  disabled={pending}
                  onChange={(e) => {
                    setDefaultCategory(e.target.value);
                    check(e.target.value); // the check shows the chosen category on these rows
                  }}
                >
                  <option value="">{t("newOtherCategory")}</option>
                  {preview.categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {categoryName(c, locale)}
                    </option>
                  ))}
                </NativeSelect>
              </section>
            )}

            {preview.newCategories.length > 0 && (
              <div className="space-y-2 rounded-md border border-dashed p-3">
                <p className="text-sm">{t("newCategories", { count: preview.newCategories.length })}</p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.newCategories.map((n) => (
                    <Badge key={n} variant="outline">
                      <bdi>{n}</bdi>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {preview.counts.error > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p role="alert" className="text-sm text-destructive">
                  {t("fixAndRetry")}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={downloadErrors}>
                  <DownloadIcon className="size-4" aria-hidden />
                  {t("downloadErrors")}
                </Button>
              </div>
            )}

            {preview.rows.length > 0 && (
              <div className="space-y-2">
                <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                  <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="size-4 accent-primary" />
                  {t("onlyProblems")}
                </label>
                <div className="max-h-[60vh] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>{t("row")}</TableHead>
                        <TableHead>{t("result")}</TableHead>
                        <TableHead>{t("fields.nameen")}</TableHead>
                        <TableHead>{tp("modelCode")}</TableHead>
                        <TableHead>{t("fields.category")}</TableHead>
                        <TableHead className="text-end">{t("fields.sellingprice")}</TableHead>
                        <TableHead className="text-end">{t("fields.stock")}</TableHead>
                        <TableHead>{t("notes")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, SHOW_ROWS).map((r) => (
                        <TableRow key={r.row} className={cn(r.action === "error" && "bg-destructive/5", r.action === "merged" && "text-muted-foreground")}>
                          <TableCell className="tabular-nums">{r.row}</TableCell>
                          <TableCell>
                            <Badge variant={BADGE[r.action]}>{t(ACTION_LABEL[r.action])}</Badge>
                          </TableCell>
                          <TableCell className="max-w-56 truncate">
                            <bdi>{r.data.nameEn ?? ""}</bdi>
                          </TableCell>
                          <TableCell className="max-w-40 truncate">
                            <Ltr>{r.modelCode || "—"}</Ltr>
                          </TableCell>
                          <TableCell className="max-w-48 truncate">{categoriesOf(r.data.categoryIds)}</TableCell>
                          <TableCell className="text-end tabular-nums">
                            <Ltr>{r.data.sellingPrice ?? ""}</Ltr>
                          </TableCell>
                          <TableCell className="text-end tabular-nums">{r.data.stock ? stockOf(r) : ""}</TableCell>
                          <TableCell className="min-w-56 whitespace-normal text-sm">
                            {notes(r).map((n, i) => (
                              <span
                                key={i}
                                className={cn(
                                  "block",
                                  n.tone === "error" ? "text-destructive" : n.tone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                                )}
                              >
                                {n.text}
                              </span>
                            ))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {rows.length - SHOW_ROWS > 0 && <p className="text-xs text-muted-foreground">{t("moreRows", { count: rows.length - SHOW_ROWS })}</p>}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {ready && (
                <Button onClick={apply} disabled={pending} className="h-11">
                  {pending && busy === "apply" ? (
                    t("importing")
                  ) : (
                    <>
                      <CheckCircle2Icon className="size-4" aria-hidden />
                      {t("apply", { count: preview.counts.create + preview.counts.update })}
                    </>
                  )}
                </Button>
              )}
              <Button variant="ghost" className="h-11" onClick={() => setPreview(null)}>
                <ArrowLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
                {t("backToColumns")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
