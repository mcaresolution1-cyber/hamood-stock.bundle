/** Shared shape of a parsed spreadsheet (from xlsx or csv). */
export type SheetRow = {
  row: number;
  /** Cell text by normalised header key (a later column with the same key wins). */
  values: Record<string, string>;
  /** Cell text by column position — what column matching (lib/import/columns.ts) works with. */
  cells: string[];
};

export type ParsedSheet = {
  /** Lower-cased, trimmed header names in file order. */
  headers: string[];
  /** The header row as typed in the file (for column matching and the error file). */
  labels?: string[];
  /** Data rows; `row` is the 1-based spreadsheet row number. */
  rows: SheetRow[];
};

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;

/** Header text → key: lower-case, no spaces/underscores ("Model Code" → "modelcode"). */
export function headerKey(text: string): string {
  return text.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Build a ParsedSheet from a matrix of cell texts. The header row is the first row with at least two
 * filled cells (a title line above the table, as supplier price lists often have, is skipped).
 */
export function sheetFromMatrix(matrix: string[][]): ParsedSheet {
  const filled = (r: string[] | undefined) => (r ?? []).filter((c) => (c ?? "").trim() !== "").length;
  let headerAt = matrix.findIndex((r, i) => i < 10 && filled(r) >= 2);
  if (headerAt < 0) headerAt = 0;
  const head = matrix[headerAt] ?? [];
  const labels = head.map((h) => (h ?? "").replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim());
  const headers = head.map(headerKey);
  const rows: SheetRow[] = [];
  matrix.slice(headerAt + 1).forEach((raw, i) => {
    if (!raw.some((c) => (c ?? "").trim() !== "")) return;
    const cells = labels.map((_, j) => (raw[j] ?? "").trim());
    const values: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (h) values[h] = cells[j];
    });
    rows.push({ row: headerAt + i + 2, values, cells });
  });
  return { headers, labels, rows };
}
