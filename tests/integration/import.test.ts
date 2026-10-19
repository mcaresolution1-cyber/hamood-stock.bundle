import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { readSheet } from "@/server/import/readSheet";
import { applyProductImport, previewProductImport } from "@/server/actions/product-import";
import { makeProduct, makeUser, resetDatabase, testDb } from "../helpers/db";
import { signInAs } from "../helpers/auth";

async function xlsxFile(rows: (string | number)[][], name = "products.xlsx") {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  rows.forEach((r) => ws.addRow(r));
  return new File([await wb.xlsx.writeBuffer()], name);
}
const form = (file: File) => {
  const fd = new FormData();
  fd.set("file", file);
  return fd;
};
const HEAD = ["modelCode", "nameEn", "nameAr", "category", "variant", "imageUrl", "cost", "lowStockLevel"];

beforeEach(async () => {
  await resetDatabase();
  signInAs(await makeUser("ADMIN"));
});
afterAll(() => testDb.$disconnect());

describe("readSheet", () => {
  it("reads xlsx, keeping numeric cells as plain text", async () => {
    const sheet = await readSheet(await xlsxFile([["Model Code", "Quantity"], [772, 5], ["HMD-1", 1.5]]));
    expect(sheet.headers).toEqual(["modelcode", "quantity"]);
    expect(sheet.rows).toEqual([
      { row: 2, values: { modelcode: "772", quantity: "5" }, cells: ["772", "5"] },
      { row: 3, values: { modelcode: "HMD-1", quantity: "1.5" }, cells: ["HMD-1", "1.5"] },
    ]);
    expect(sheet.labels).toEqual(["Model Code", "Quantity"]);
  });

  it("reads csv with a BOM and Arabic text", async () => {
    const file = new File(["﻿modelCode,nameAr\nHMD-1,حامل\n"], "p.csv", { type: "text/csv" });
    expect((await readSheet(file)).rows).toEqual([{ row: 2, values: { modelcode: "HMD-1", namear: "حامل" }, cells: ["HMD-1", "حامل"] }]);
  });

  it("reads a CSV saved by Excel on Arabic Windows (Windows-1256) and tab-separated text", async () => {
    // "حامل" in Windows-1256
    const cp1256 = new Uint8Array([...Buffer.from("modelCode,nameAr\nHMD-1,"), 0xcd, 0xc7, 0xe3, 0xe1, 0x0a]);
    const rows = (await readSheet(new File([cp1256], "p.csv"))).rows;
    expect(rows[0].values.modelcode).toBe("HMD-1");
    expect(rows[0].values.namear).toBe("حامل");
    const tsv = new File(["Code\tName\nHMD-2\tMount, black\n"], "p.txt");
    expect((await readSheet(tsv)).rows[0].cells).toEqual(["HMD-2", "Mount, black"]);
  });

  it("rejects other file types, empty and oversized files", async () => {
    await expect(readSheet(new File(["x"], "p.xls"))).rejects.toMatchObject({ key: "import.errors.fileType" });
    await expect(readSheet(new File([], "p.csv"))).rejects.toMatchObject({ key: "import.errors.noFile" });
    await expect(readSheet(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "p.csv"))).rejects.toMatchObject({
      key: "import.errors.tooBig",
    });
    await expect(readSheet(new File(["not a zip"], "p.xlsx"))).rejects.toMatchObject({ key: "import.errors.unreadable" });
  });
});

describe("product import", () => {
  it("previews, then creates and updates by model code without touching stock or status", async () => {
    const existing = await makeProduct("HMD-772");
    await testDb.product.update({ where: { id: existing.id }, data: { status: "DISCONTINUED", variant: "Black" } });
    const file = await xlsxFile([
      HEAD,
      ["HMD-900", "Floor stand", "ستاند أرضي", "Floor stands", "", "", "1,250.50", 3],
      ["hmd-772", "Renamed mount", "", "", "", "", "", ""],
    ]);

    const preview = await previewProductImport(form(file));
    expect(preview).toMatchObject({ ok: true, data: { counts: { create: 1, update: 1, error: 0 } } });

    const applied = await applyProductImport(form(file));
    expect(applied).toEqual({ ok: true, data: { created: 1, updated: 1, categories: 0, warehouses: 0, entries: [] } });

    const created = await testDb.product.findUniqueOrThrow({ where: { modelCode: "HMD-900" }, include: { categories: true } });
    expect(created).toMatchObject({ lowStockLevel: 3, status: "ACTIVE", categories: [{ categoryId: "cat-floor-stand", position: 0 }] });
    expect(created.cost?.toString()).toBe("1250.5");
    const updated = await testDb.product.findUniqueOrThrow({ where: { id: existing.id } });
    expect(updated).toMatchObject({ nameEn: "Renamed mount", nameAr: existing.nameAr, variant: "Black", status: "DISCONTINUED" });
    expect(await testDb.stockLevel.count()).toBe(0);
    expect(await testDb.stockEntry.count()).toBe(0);
  });

  it("saves nothing when any row has an error", async () => {
    const file = await xlsxFile([HEAD, ["OK-1", "a", "ب", "wall-mount, Chairs"], ["BAD-1", "a", "ب", "chairs", "", "", "lots"]]);
    expect(await applyProductImport(form(file))).toMatchObject({ ok: false, error: "import.errors.fixFirst" });
    expect(await testDb.product.count()).toBe(0);
    expect(await testDb.category.count()).toBe(4); // no category created either
  });
});
