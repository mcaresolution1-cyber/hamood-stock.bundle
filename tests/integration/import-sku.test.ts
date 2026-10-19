/** Plan import-sku: HMD00 SKUs in order, and the old POS export imported with stock per warehouse. */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { applyProductImport, previewProductImport, readProductImportColumns, type ImportPreview } from "@/server/actions/product-import";
import { createProduct } from "@/server/actions/products";
import { makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { expectLedgerMatchesLevels, level } from "../helpers/ledger";
import { signInAs } from "../helpers/auth";

/** The old software's export, as in the owner's file (shortened). */
const HEAD = '"", ,"Action","Product","Business Location","Unit Purchase Price","Selling Price","Current stock","Product Type","Category","Brand","Tax","SKU"';
const row = (product: string, location: string, cost: string, price: string, stock: string, category: string, sku: string) =>
  `"","","ActionsToggle Dropdown View Edit","${product}","${location}","﷼ ${cost}","﷼ ${price}","${stock} Pieces","Single","${category}","","","${sku}"`;
const FOOTER = Array(13).fill('"Add to location   Remove from location"').join(",");
const OLD_FILE = [
  HEAD,
  row("0001 black", "WAREHOUSE A", "500.00", "500.00", "3.00", "TABLETOP TV MOUNT", "0001 black1074"),
  row("Ham-144", "WAREHOUSE A", "250.00", "250.00", "326.00", "FLOOR STAND", "x1"),
  row("Ham-144", "WAREHOUSE C", "280.00", "280.00", "2.00", "FLOOR STAND", "x2"),
  row("Ham-160", "Riyadh Main", "200.00", "249.00", "1,207.00", "WALL MOUNT", "x3"),
  row("Fireplace 100cm 910", "WAREHOUSE A", "900.00", "1,100.00", "0.00", "", "x4"),
  FOOTER,
].join("\n");

const upload = (csv: string, extra: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("file", new File([csv], "Products - Hamood tv.csv", { type: "text/csv" }));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
};

let main: string;
beforeEach(async () => {
  await resetDatabase();
  main = (await makeWarehouse("SELLABLE", "Riyadh Main")).id;
  signInAs(await makeUser("ADMIN"));
});
afterAll(() => testDb.$disconnect());

describe("old POS export (PS2–PS6)", () => {
  it("matches the columns, merges per product, and imports with HMD00 SKUs in file order and opening stock per warehouse", async () => {
    const cols = await readProductImportColumns(upload(OLD_FILE));
    expect(cols).toMatchObject({ ok: true, data: { mapping: { "3": "nameen", "4": "warehouse", "5": "cost", "6": "sellingprice", "7": "stock", "9": "category", "12": "sku" } } });
    const mapping = JSON.stringify((cols as { data: { mapping: unknown } }).data.mapping);

    const preview = (await previewProductImport(upload(OLD_FILE, { mapping }))) as { ok: true; data: ImportPreview };
    expect(preview.data).toMatchObject({
      counts: { create: 4, update: 0, merged: 1, error: 0 },
      ignoredRows: 1,
      defaulted: 1,
      newCategories: ["Tabletop TV Mount", "Other"],
      locations: [
        { label: "WAREHOUSE A", products: 2, units: 329 },
        { label: "WAREHOUSE C", products: 1, units: 2 },
        { label: "Riyadh Main", products: 1, units: 1207 },
      ],
    });
    // Known warehouse by name; unknown ones would be created
    expect(preview.data.stock.suggested).toEqual({ "WAREHOUSE A": "new", "WAREHOUSE C": "new", "Riyadh Main": main });

    // The user sends WAREHOUSE C's stock to Riyadh Main instead of creating it
    const locations = JSON.stringify({ ...preview.data.stock.suggested, "WAREHOUSE C": main });
    const done = await applyProductImport(upload(OLD_FILE, { mapping, locations }));
    expect(done).toMatchObject({ ok: true, data: { created: 4, updated: 0, categories: 2, warehouses: 1 } });
    expect((done as { data: { entries: string[] } }).data.entries).toHaveLength(2);

    const products = await testDb.product.findMany({ orderBy: { sku: "asc" }, include: { categories: { include: { category: true } } } });
    expect(products.map((p) => [p.sku, p.modelCode, p.nameEn, p.nameAr, p.sellingPrice?.toFixed(2), p.categories.map((c) => c.category.nameEn)])).toEqual([
      ["HMD00001", "0001 BLACK", "0001 black", "0001 black", "500.00", ["Tabletop TV Mount"]],
      ["HMD00002", "HAM-144", "Ham-144", "Ham-144", "250.00", ["Floor stands"]],
      ["HMD00003", "HAM-160", "Ham-160", "Ham-160", "249.00", ["TV wall mounts"]],
      ["HMD00004", "FIREPLACE 100CM 910", "Fireplace 100cm 910", "Fireplace 100cm 910", "1100.00", ["Other"]],
    ]);
    expect(await testDb.category.findFirstOrThrow({ where: { nameEn: "Other" } })).toMatchObject({ nameAr: "أخرى" });

    const a = await testDb.warehouse.findUniqueOrThrow({ where: { name: "WAREHOUSE A" } });
    const ham144 = products[1];
    expect(await level(ham144.id, a.id)).toBe(326);
    expect(await level(ham144.id, main)).toBe(2);
    expect(await level(products[2].id, main)).toBe(1207);
    expect(await testDb.stockEntry.findMany({ select: { reason: true, note: true }, orderBy: { number: "asc" } })).toEqual([
      { reason: "OPENING_STOCK", note: "Products - Hamood tv.csv" },
      { reason: "OPENING_STOCK", note: "Products - Hamood tv.csv" },
    ]);
    await expectLedgerMatchesLevels();
    expect((await testDb.counter.findUniqueOrThrow({ where: { key: "SKU" } })).value).toBe(4);

    // The same file again: products are updated, never duplicated; stock is not added twice.
    const again = (await previewProductImport(upload(OLD_FILE, { mapping }))) as { ok: true; data: ImportPreview };
    expect(again.data.counts).toMatchObject({ create: 0, update: 4 });
    expect(again.data.locations).toEqual([]);
    expect(await applyProductImport(upload(OLD_FILE, { mapping, locations: "{}" }))).toMatchObject({ ok: true, data: { created: 0, updated: 4, entries: [] } });
    expect(await testDb.product.count()).toBe(4);
    expect(await level(ham144.id, a.id)).toBe(326);

    // A product added on the form afterwards continues the numbering.
    const next = await createProduct({ modelCode: "NEW-1", barcode: "", nameEn: "New", nameAr: "", categoryIds: ["cat-wall-mount"], status: "ACTIVE", variant: "", sizeRange: "", colour: "", maxLoadKg: "", vesa: "", imageUrl: "", cost: "", sellingPrice: "", lowStockLevel: "0", leadTimeDays: "", wooProductId: "", wooSku: "", defaultSupplierId: "", reorder: [] });
    expect(next).toMatchObject({ ok: true, data: { sku: "HMD00005" } });
  });

  it("puts products without a category in the one chosen; stock without a warehouse column needs a warehouse", async () => {
    await makeWarehouse("SELLABLE", "Jeddah");
    const csv = "Product,Price,Stock\nShelf A,10,5\nShelf B,12,0\n";
    const preview = (await previewProductImport(upload(csv, { defaultCategory: "cat-tv-table" }))) as { ok: true; data: ImportPreview };
    expect(preview.data).toMatchObject({ defaulted: 2, newCategories: [], locations: [{ label: "", products: 1, units: 5 }] });
    expect(preview.data.stock.suggested).toEqual({ "": "new" }); // two warehouses: the user must choose
    expect(await applyProductImport(upload(csv, { defaultCategory: "cat-tv-table", locations: JSON.stringify({ "": "new" }) }))).toMatchObject({
      ok: false,
      error: "import.errors.chooseWarehouse",
    });
    expect(await applyProductImport(upload(csv, { defaultCategory: "cat-tv-table", locations: JSON.stringify({ "": main }) }))).toMatchObject({ ok: true });
    const shelf = await testDb.product.findUniqueOrThrow({ where: { modelCode: "SHELF A" }, include: { categories: true } });
    expect(shelf.categories.map((c) => c.categoryId)).toEqual(["cat-tv-table"]);
    expect(await level(shelf.id, main)).toBe(5);
    // a hidden or unknown default category is refused
    expect(await previewProductImport(upload(csv, { defaultCategory: "nope" }))).toMatchObject({ ok: false, error: "products.errors.unknownCategory" });
  });

  it("refuses stock into a warehouse that isn't active, and saves nothing", async () => {
    const closed = await makeWarehouse("SELLABLE", "Closed");
    await testDb.warehouse.update({ where: { id: closed.id }, data: { active: false } });
    const csv = "Product,Category,Stock\nShelf A,TV tables,5\n";
    expect(await applyProductImport(upload(csv, { locations: JSON.stringify({ "": closed.id }) }))).toMatchObject({ ok: false, error: "stock.errors.warehouseInactive" });
    expect(await testDb.product.count()).toBe(0);
    expect((await testDb.counter.findUniqueOrThrow({ where: { key: "SKU" } })).value).toBe(0); // no SKU used up
  });
});
