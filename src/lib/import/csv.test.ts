import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { sheetFromMatrix } from "./sheet";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and a BOM", () => {
    const text = '﻿modelCode,nameEn\r\nHMD-772,"Mount, ""full-motion"""\r\n';
    expect(parseCsv(text)).toEqual([
      ["modelCode", "nameEn"],
      ["HMD-772", 'Mount, "full-motion"'],
    ]);
  });

  it("detects semicolon-separated files", () => {
    expect(parseCsv("modelCode;quantity\nHMD-772;5")).toEqual([
      ["modelCode", "quantity"],
      ["HMD-772", "5"],
    ]);
  });

  it("skips blank lines and keeps Arabic text", () => {
    expect(parseCsv("a,b\n\nحامل,1\n")).toEqual([
      ["a", "b"],
      ["حامل", "1"],
    ]);
  });
});

describe("sheetFromMatrix", () => {
  it("normalises headers and numbers rows like the spreadsheet", () => {
    const sheet = sheetFromMatrix([
      ["Model Code", "Low_Stock_Level"],
      ["HMD-1", "3"],
      ["", ""],
      ["HMD-2", ""],
    ]);
    expect(sheet.headers).toEqual(["modelcode", "lowstocklevel"]);
    expect(sheet.rows).toEqual([
      { row: 2, values: { modelcode: "HMD-1", lowstocklevel: "3" } },
      { row: 4, values: { modelcode: "HMD-2", lowstocklevel: "" } },
    ]);
  });
});
