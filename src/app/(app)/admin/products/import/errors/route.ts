/**
 * POST the same import file → an .xlsx of only the rows with errors, with an extra "errors" column
 * (brief P1.1: "allow downloading the error rows"). The file is re-read and re-validated here.
 */
import { getLocale, getTranslations } from "next-intl/server";
import { routeGuard } from "@/server/export/template";
import { stamp, xlsxFile } from "@/server/export/xlsx";
import { validateImportFile } from "@/server/import/product-import";
import { UserFacingError } from "@/server/actions/result";

export async function POST(request: Request) {
  // Same-origin only (a form on another site must not be able to make a signed-in admin call this).
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response("Forbidden", { status: 403 });
  const denied = await routeGuard("product:manage");
  if (denied) return denied;

  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  let checked;
  try {
    checked = await validateImportFile(await request.formData());
  } catch (e) {
    if (e instanceof UserFacingError) return new Response(t(e.key as "import.errors.noFile", e.params), { status: 400 });
    throw e;
  }
  const failing = new Map(checked.result.rows.filter((r) => r.action === "error").map((r) => [r.row, r]));
  const message = (key: string) => (t.has(key as "errors.generic") ? t(key as "errors.generic") : key);

  // The user's own columns, as in the uploaded file, so the rows can be fixed and uploaded again.
  const labels = checked.sheet.labels ?? [];
  const columns = [
    { key: "row", header: t("import.row"), number: true, width: 8 },
    ...labels.map((label, i) => ({ key: `c${i}`, header: label || `#${i + 1}` })),
    { key: "errors", header: t("import.errorsColumn"), width: 60 },
  ];
  const fieldLabel = (field: string) => {
    const key = `import.fields.${field.toLowerCase()}`;
    return t.has(key as "errors.generic") ? t(key as "errors.generic") : field;
  };
  const rows = checked.sheet.rows
    .filter((r) => failing.has(r.row))
    .map((r) => ({
      row: r.row,
      ...Object.fromEntries(labels.map((_, i) => [`c${i}`, r.cells[i] ?? ""])),
      errors: failing
        .get(r.row)!
        .errors.map((e) => `${fieldLabel(e.field)}: ${message(e.key)}`)
        .join(" · "),
    }));
  return xlsxFile({ filename: `product-import-errors-${stamp()}.xlsx`, sheet: t("import.errorsColumn"), columns, rows, rtl: locale === "ar" });
}
