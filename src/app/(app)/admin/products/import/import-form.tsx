"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilePicker } from "@/components/file-picker";
import { useMessage } from "@/components/use-message";
import { Ltr } from "@/components/ltr";
import type { ProductImportResult } from "@/lib/import/products";
import { applyProductImport, previewProductImport } from "@/server/actions/product-import";

const BADGE = { create: "default", update: "secondary", error: "destructive" } as const;

export function ImportForm() {
  const t = useTranslations("import");
  const tp = useTranslations("products");
  const message = useMessage();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProductImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"check" | "apply" | null>(null);

  const formData = () => {
    const fd = new FormData();
    if (file) fd.set("file", file);
    return fd;
  };

  function check() {
    setAction("check");
    startTransition(async () => {
      const result = await previewProductImport(formData());
      if (result.ok) setPreview(result.data);
      else {
        setPreview(null);
        toast.error(message(result.error, result.params));
      }
    });
  }

  function apply() {
    setAction("apply");
    startTransition(async () => {
      const result = await applyProductImport(formData());
      if (result.ok) {
        toast.success(t("done", result.data));
        router.push("/admin/products");
        router.refresh();
      } else toast.error(message(result.error, result.params));
    });
  }

  const ready = preview && !preview.fileErrors.length && preview.counts.error === 0 && preview.rows.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("columns")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("columnsHelp")}</p>
          <Button variant="outline" size="sm" asChild>
            <a href="/admin/products/import/template" download>
              <DownloadIcon className="size-4" aria-hidden />
              {t("template")}
            </a>
          </Button>
          <FilePicker
            label={t("file")}
            buttonLabel={t("chooseFile")}
            accept=".xlsx,.csv"
            file={file}
            onChange={(f) => {
              setFile(f);
              setPreview(null);
            }}
          />
          <Button onClick={check} disabled={!file || pending} className="h-11">
            {pending && action === "check" ? t("checking") : t("preview")}
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("summary", preview.counts)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.fileErrors.map((e) => (
              <p key={e} role="alert" className="text-sm text-destructive">
                {message(e)}
              </p>
            ))}
            {preview.counts.error > 0 && (
              <p role="alert" className="text-sm text-destructive">
                {t("fixAndRetry")}
              </p>
            )}
            {preview.rows.length > 0 && (
              <div className="max-h-[60vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("row")}</TableHead>
                      <TableHead>{tp("modelCode")}</TableHead>
                      <TableHead>{t("action")}</TableHead>
                      <TableHead>{t("problems")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((r) => (
                      <TableRow key={r.row}>
                        <TableCell className="tabular-nums">{r.row}</TableCell>
                        <TableCell className="font-medium">
                          <Ltr>{r.modelCode || "—"}</Ltr>
                        </TableCell>
                        <TableCell>
                          <Badge variant={BADGE[r.action]}>
                            {t(r.action === "create" ? "actionCreate" : r.action === "update" ? "actionUpdate" : "actionError")}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-normal text-sm text-destructive">
                          {r.errors.map((e) => `${e.field}: ${message(e.key)}`).join(" · ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {ready && (
              <Button onClick={apply} disabled={pending} className="h-11">
                {pending && action === "apply"
                  ? t("importing")
                  : t("apply", { count: preview.counts.create + preview.counts.update })}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
