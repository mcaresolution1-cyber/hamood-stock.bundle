/**
 * Excel export: one sheet (or several), translated headers, right-to-left sheet for Arabic, numbers stored as
 * numbers. Text is written as typed string cells (never as { formula }), which Excel does not evaluate,
 * so a product named "=HYPERLINK(…)" stays harmless text and the export shows exactly what the screen
 * shows (decision B13). Never pass user text as a formula, and never switch this export to CSV.
 */
import "server-only";
import ExcelJS from "exceljs";

export type XlsxColumn = { key: string; header: string; width?: number; number?: boolean; money?: boolean };
export type XlsxRow = Record<string, string | number | null | undefined>;

export type XlsxSheet = { name: string; columns: XlsxColumn[]; rows: XlsxRow[]; footer?: XlsxRow; note?: string; title?: string[] };

function addSheet(wb: ExcelJS.Workbook, sheet: XlsxSheet, rtl: boolean) {
  const head = sheet.title?.length ?? 0;
  const ws = wb.addWorksheet(sheet.name.slice(0, 31), { views: [{ rightToLeft: rtl, state: "frozen", ySplit: head + 1 }] });
  // Optional lines above the table (report title, filters) — then the header row.
  for (const line of sheet.title ?? []) ws.addRow([line]).font = { bold: line === sheet.title![0] };
  const headerRow = ws.addRow(sheet.columns.map((c) => c.header));
  headerRow.font = { bold: true };
  sheet.columns.forEach((c, i) => (ws.getColumn(i + 1).width = c.width ?? (c.number ? 12 : 22)));

  const cell = (c: XlsxColumn, v: XlsxRow[string]) => {
    if (v === null || v === undefined || v === "") return null;
    if (c.number || c.money) return typeof v === "number" ? v : Number(v);
    return String(v);
  };
  for (const row of sheet.rows) ws.addRow(sheet.columns.map((c) => cell(c, row[c.key])));
  if (sheet.footer) ws.addRow(sheet.columns.map((c) => cell(c, sheet.footer![c.key]))).font = { bold: true };
  sheet.columns.forEach((c, i) => {
    if (c.money) ws.getColumn(i + 1).numFmt = "#,##0.00";
    else if (c.number) ws.getColumn(i + 1).numFmt = "#,##0";
  });
  if (sheet.note) {
    ws.addRow([]);
    ws.addRow([sheet.note]).font = { italic: true };
  }
}

async function respond(wb: ExcelJS.Workbook, filename: string): Promise<Response> {
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

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
  addSheet(wb, { name: opts.sheet, columns: opts.columns, rows: opts.rows, footer: opts.footer, note: opts.note }, opts.rtl);
  return respond(wb, opts.filename);
}

/** Several sheets in one file (the inventory report: summary, days, products, movements). */
export async function xlsxWorkbook(opts: { filename: string; sheets: XlsxSheet[]; rtl: boolean }): Promise<Response> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Hamood Stock";
  for (const s of opts.sheets) addSheet(wb, s, opts.rtl);
  return respond(wb, opts.filename);
}

export function stamp(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}
