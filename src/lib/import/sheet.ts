/** Shared shape of a parsed spreadsheet (from xlsx or csv). */
export type SheetRow = { row: number; values: Record<string, string> };

export type ParsedSheet = {
  /** Lower-cased, trimmed header names in file order. */
  headers: string[];
  /** Data rows; `row` is the 1-based spreadsheet row number (header = row 1). */
  rows: SheetRow[];
};

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;

/** Header text → key: lower-case, no spaces/underscores ("Model Code" → "modelcode"). */
export function headerKey(text: string): string {
  return text.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** Build a ParsedSheet from a matrix of cell texts (first row = headers). */
export function sheetFromMatrix(matrix: string[][]): ParsedSheet {
  const [head = [], ...body] = matrix;
  const headers = head.map(headerKey);
  const rows: SheetRow[] = [];
  body.forEach((cells, i) => {
    if (!cells.some((c) => (c ?? "").trim() !== "")) return;
    const values: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (h) values[h] = (cells[j] ?? "").trim();
    });
    rows.push({ row: i + 2, values });
  });
  return { headers, rows };
}
