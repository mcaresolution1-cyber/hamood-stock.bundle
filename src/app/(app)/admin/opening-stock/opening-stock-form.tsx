"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { DownloadIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilePicker } from "@/components/file-picker";
import { NativeSelect } from "@/components/native-select";
import { useMessage } from "@/components/use-message";
import { Ltr } from "@/components/ltr";
import { applyOpeningStock, previewOpeningStock, type OpeningStockPreview } from "@/server/actions/opening-stock";

export function OpeningStockForm({ warehouses }: { warehouses: { id: string; name: string }[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const message = useMessage();
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses.length === 1 ? warehouses[0].id : "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<OpeningStockPreview | null>(null);
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"check" | "apply" | null>(null);

  const formData = () => {
    const fd = new FormData();
    fd.set("warehouseId", warehouseId);
    if (file) fd.set("file", file);
    if (confirmAdd) fd.set("confirmAdd", "yes");
    return fd;
  };
  const reset = () => {
    setPreview(null);
    setConfirmAdd(false);
    setSaved(null);
  };

  function check() {
    setAction("check");
    startTransition(async () => {
      const result = await previewOpeningStock(formData());
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
      const result = await applyOpeningStock(formData());
      if (result.ok) {
        toast.success(t("openingStock.saved", { number: result.data.number }));
        setSaved(result.data.number);
        setPreview(null);
        setFile(null);
        router.refresh();
      } else toast.error(message(result.error, result.params));
    });
  }

  const hasErrors = preview && (preview.fileErrors.length > 0 || preview.totals.errors > 0);
  const needsConfirm = Boolean(preview?.existing.length);
  const canSave = preview && !hasErrors && preview.rows.length > 0 && (!needsConfirm || confirmAdd);

  return (
    <div className="space-y-4">
      {saved && (
        <p role="status" className="rounded-md border border-green-600/30 bg-green-600/10 p-3 text-sm font-medium">
          {t("openingStock.saved", { number: saved })}
        </p>
      )}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <label htmlFor="warehouse" className="text-sm font-medium">
              {t("openingStock.warehouse")}
            </label>
            <NativeSelect
              id="warehouse"
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                reset();
              }}
            >
              <option value="">{t("openingStock.chooseWarehouse")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href="/admin/opening-stock/template" download>
              <DownloadIcon className="size-4" aria-hidden />
              {t("import.template")}
            </a>
          </Button>
          <FilePicker
            label={t("import.file")}
            buttonLabel={t("import.chooseFile")}
            accept=".xlsx,.csv"
            file={file}
            onChange={(f) => {
              setFile(f);
              reset();
            }}
          />
          <Button onClick={check} disabled={!file || !warehouseId || pending} className="h-11">
            {pending && action === "check" ? t("import.checking") : t("import.preview")}
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {preview.warehouse.name} · {t("openingStock.totals", { lines: preview.totals.lines, units: preview.totals.units })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.fileErrors.map((e) => (
              <p key={e} role="alert" className="text-sm text-destructive">
                {message(e)}
              </p>
            ))}
            {preview.totals.errors > 0 && (
              <p role="alert" className="text-sm text-destructive">
                {t("import.fixAndRetry")}
              </p>
            )}
            {preview.rows.length > 0 && (
              <div className="max-h-[50vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("import.row")}</TableHead>
                      <TableHead>{t("openingStock.product")}</TableHead>
                      <TableHead className="text-end">{t("openingStock.quantity")}</TableHead>
                      <TableHead>{t("import.problems")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((r) => (
                      <TableRow key={r.row}>
                        <TableCell className="tabular-nums">{r.row}</TableCell>
                        <TableCell className="whitespace-normal">
                          <Ltr className="block font-medium">{r.modelCode || "—"}</Ltr>
                          {r.product && (
                            <div className="text-xs text-muted-foreground">
                              {locale === "ar" ? r.product.nameAr : r.product.nameEn}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">{r.quantity ?? "—"}</TableCell>
                        <TableCell className="whitespace-normal text-sm text-destructive">
                          {r.errors.map((e) => message(e.key)).join(" · ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {!hasErrors && needsConfirm && (
              <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="flex gap-2 text-sm">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                  {t("openingStock.existingWarning", {
                    name: preview.warehouse.name,
                    numbers: preview.existing.map((e) => e.number).join(", "),
                  })}
                </p>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={confirmAdd}
                    onChange={(e) => setConfirmAdd(e.target.checked)}
                  />
                  {t("openingStock.confirmAdd")}
                </label>
              </div>
            )}

            {!hasErrors && preview.rows.length > 0 && (
              <Button onClick={apply} disabled={!canSave || pending} className="h-11">
                {pending && action === "apply" ? t("openingStock.saving") : t("openingStock.apply")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
