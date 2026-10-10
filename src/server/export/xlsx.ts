/**
 * Excel export: one sheet, translated headers, right-to-left sheet for Arabic, numbers stored as
 * numbers. Text is written as typed string cells (never as { formula }), which Excel does not evaluate,
 * so a product named "=HYPERLINK(…)" stays harmless text and the export shows exactly what the screen
 * shows (decision B13). Never pass user text as a formula, and never switch this export to CSV.
 */
import "server-only";
import ExcelJS from "exceljs";

export type XlsxColumn = { key: string; header: string; width?: number; number?: boolean; money?: boolean };
export type XlsxRow = Record<string, string | number | null | undefined>;

export async function xlsxFile(opts: {
  filename: string;
  sheet: string;
  columns: XlsxColumn[];
  rows: XlsxRow[];
  footer?: XlsxRow;
  rtl: boolean;
  note?: string;
}): Promise<Response> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Hamood Stock";
  const ws = wb.addWorksheet(opts.sheet.slice(0, 31), { views: [{ rightToLeft: opts.rtl, state: "frozen", ySplit: 1 }] });
  ws.columns = opts.columns.map((c) => ({ key: c.key, header: c.header, width: c.width ?? (c.number ? 12 : 22) }));
  ws.getRow(1).font = { bold: true };

  const cell = (c: XlsxColumn, v: XlsxRow[string]) => {
    if (v === null || v === undefined || v === "") return null;
    if (c.number || c.money) return typeof v === "number" ? v : Number(v);
    return String(v);
  };
  for (const row of opts.rows) ws.addRow(Object.fromEntries(opts.columns.map((c) => [c.key, cell(c, row[c.key])])));
  if (opts.footer) {
    const r = ws.addRow(Object.fromEntries(opts.columns.map((c) => [c.key, cell(c, opts.footer![c.key])])));
    r.font = { bold: true };
  }
  for (const c of opts.columns) if (c.money) ws.getColumn(c.key).numFmt = "#,##0.00";
  if (opts.note) {
    ws.addRow([]);
    ws.addRow([opts.note]).font = { italic: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${opts.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export function stamp(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}
