/**
 * Read an uploaded .xlsx or .csv into a ParsedSheet (header names normalised). Server only.
 * Limits: 2 MB, 2,000 data rows, first worksheet only.
 */
import "server-only";
import ExcelJS from "exceljs";
import { parseCsv } from "@/lib/import/csv";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, sheetFromMatrix, type ParsedSheet } from "@/lib/import/sheet";
import { UserFacingError } from "@/server/actions/result";

export async function readSheet(file: unknown): Promise<ParsedSheet> {
  if (!(file instanceof File) || file.size === 0) throw new UserFacingError("import.errors.noFile");
  if (file.size > MAX_IMPORT_BYTES) throw new UserFacingError("import.errors.tooBig");

  const name = file.name.toLowerCase();
  const bytes = Buffer.from(await file.arrayBuffer());
  let sheet: ParsedSheet;

  if (name.endsWith(".csv")) {
    sheet = sheetFromMatrix(parseCsv(bytes.toString("utf8")));
  } else if (name.endsWith(".xlsx")) {
    sheet = await readXlsx(bytes);
  } else {
    throw new UserFacingError("import.errors.fileType");
  }

  if (sheet.rows.length > MAX_IMPORT_ROWS) {
    throw new UserFacingError("import.errors.tooManyRows", { max: MAX_IMPORT_ROWS });
  }
  return sheet;
}

/** Exported for tests. */
export async function readXlsx(bytes: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    throw new UserFacingError("import.errors.unreadable");
  }
  const ws = workbook.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  const matrix: string[][] = [];
  const width = ws.columnCount;
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c)));
    matrix[rowNumber - 1] = cells;
  });
  // eachRow skips trailing empties; fill holes so row numbers stay true to the sheet.
  for (let i = 0; i < matrix.length; i++) matrix[i] ??= [];
  return sheetFromMatrix(matrix);
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v); // 772 stays "772", never "772.0"
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "result" in v) return v.result == null ? "" : String(v.result);
  return cell.text ?? "";
}
