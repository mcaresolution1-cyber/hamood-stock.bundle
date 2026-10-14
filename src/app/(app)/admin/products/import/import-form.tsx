"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeftIcon, CheckCircle2Icon, DownloadIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilePicker } from "@/components/file-picker";
import { NativeSelect } from "@/components/native-select";
import { useMessage } from "@/components/use-message";
import { Ltr } from "@/components/ltr";
import { categoryKey, categoryName } from "@/lib/categories";
import { mappingProblems, REQUIRED_FIELDS, type ColumnMapping, type ImportField } from "@/lib/import/columns";
import { NEW_CATEGORY, PRODUCT_IMPORT_COLUMNS } from "@/lib/import/products";
import { applyProductImport, previewProductImport, readProductImportColumns, type ImportColumns, type ImportPreview } from "@/server/actions/product-import";
import { runAction } from "@/lib/run-action";
import { cn } from "@/lib/utils";

const BADGE = { create: "default", update: "secondary", error: "destructive" } as const;

/**
 * Product import in three steps (plan ui-menu-import-categories, PU3): choose a file → match its columns
 * (suggested automatically, editable) and see the first rows → check every row → import.
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
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"read" | "check" | "apply" | null>(null);
  const latest = useRef<File | null>(null);

  const fieldLabel = (f: ImportField) => t(`fields.${f}`);
  const problems = useMemo(() => mappingProblems(mapping), [mapping]);
  const mapped = useMemo(
    () => Object.entries(mapping).filter((e): e is [string, ImportField] => Boolean(e[1])).map(([col, field]) => ({ col: Number(col), field })),
    [mapping],
  );

  const formData = () => {
    const fd = new FormData();
    if (file) fd.set("file", file);
    fd.set("mapping", JSON.stringify(mapping));
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

  function check() {
    setBusy("check");
    startTransition(async () => {
      const result = await runAction(() => previewProductImport(formData()), { retry: true });
      if (result.ok) setPreview(result.data);
      else {
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
        toast.success(t("done", result.data));
        router.push("/admin/products");
        router.refresh();
      } else toast.error(message(result.error, result.params));
    });
  }

  const ready = preview && !preview.fileErrors.length && preview.counts.error === 0 && preview.rows.length > 0;
  const categoriesOf = (ids: string[] | undefined) =>
    (ids ?? [])
      .map((id) =>
        id.startsWith(NEW_CATEGORY)
          ? (preview?.newCategories.find((n) => categoryKey(n) === id.slice(NEW_CATEGORY.length)) ?? id.slice(NEW_CATEGORY.length))
          : preview?.categoryNames[id]
            ? categoryName(preview.categoryNames[id], locale)
            : id,
      )
      .join(" · ");

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
                return (
                  <li key={c.index} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <bdi>{c.label || t("noHeader", { n: c.index + 1 })}</bdi>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.samples.filter(Boolean).length ? (
                          c.samples
                            .filter(Boolean)
                            .slice(0, 3)
                            .map((s, i) => (
                              <span key={i}>
                                {i > 0 && " · "}
                                <bdi>{s}</bdi>
                              </span>
                            ))
                        ) : (
                          t("emptyColumn")
                        )}
                      </p>
                    </div>
                    <NativeSelect
                      aria-label={t("fieldFor", { column: c.label || String(c.index + 1) })}
                      value={field}
                      onChange={(e) => pick(c.index, e.target.value as ImportField | "")}
                      className={cn(field ? "" : "text-muted-foreground")}
                    >
                      <option value="">{t("skipColumn")}</option>
                      {PRODUCT_IMPORT_COLUMNS.map((f) => (
                        <option key={f} value={f}>
                          {fieldLabel(f)}
                          {REQUIRED_FIELDS[f] ? ` *` : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  </li>
                );
              })}
            </ul>

            <p className="text-xs text-muted-foreground">{t("requiredNote")}</p>
            {problems.missing.includes("modelcode") ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("needModelCode")}
              </p>
            ) : (
              problems.missing.length > 0 && (
                <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t("missingForNew", { fields: problems.missing.map(fieldLabel).join(locale === "ar" ? "، " : ", ") })}
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

            <Button onClick={check} disabled={pending || problems.missing.includes("modelcode")} className="h-11">
              {pending && busy === "check" ? t("checking") : t("preview", { count: columns.rowCount })}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — result of the check, then import */}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("step3")}</CardTitle>
            <CardDescription>{t("summary", preview.counts)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.fileErrors.map((e) => (
              <p key={e} role="alert" className="text-sm text-destructive">
                {message(e)}
              </p>
            ))}
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
              <div className="max-h-[60vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("row")}</TableHead>
                      <TableHead>{tp("modelCode")}</TableHead>
                      <TableHead>{t("result")}</TableHead>
                      <TableHead>{t("fields.nameen")}</TableHead>
                      <TableHead>{t("fields.namear")}</TableHead>
                      <TableHead>{t("fields.category")}</TableHead>
                      <TableHead>{t("fields.sellingprice")}</TableHead>
                      <TableHead>{t("problems")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((r) => (
                      <TableRow key={r.row} className={r.action === "error" ? "bg-destructive/5" : ""}>
                        <TableCell className="tabular-nums">{r.row}</TableCell>
                        <TableCell className="font-medium">
                          <Ltr>{r.modelCode || "—"}</Ltr>
                        </TableCell>
                        <TableCell>
                          <Badge variant={BADGE[r.action]}>
                            {t(r.action === "create" ? "actionCreate" : r.action === "update" ? "actionUpdate" : "actionError")}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-48 truncate">{r.data.nameEn ?? ""}</TableCell>
                        <TableCell className="max-w-48 truncate" dir="rtl">
                          {r.data.nameAr ?? ""}
                        </TableCell>
                        <TableCell className="max-w-48 truncate">{categoriesOf(r.data.categoryIds)}</TableCell>
                        <TableCell className="tabular-nums">
                          <Ltr>{r.data.sellingPrice ?? ""}</Ltr>
                        </TableCell>
                        <TableCell className="min-w-48 whitespace-normal text-sm text-destructive">
                          {r.errors.map((e) => `${t.has(`fields.${e.field.toLowerCase()}` as "fields.cost") ? t(`fields.${e.field.toLowerCase()}` as "fields.cost") : e.field}: ${message(e.key)}`).join(" · ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
