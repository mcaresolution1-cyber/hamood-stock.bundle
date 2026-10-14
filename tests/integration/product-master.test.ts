/** v2 Phase B: product master (status, SKU/barcode, cost history, levels, images, list/export) and suppliers. */
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const messages = (await import("../../messages/en.json")).default;
  return {
    getLocale: async () => "en",
    getTranslations: async (ns?: string) => createTranslator({ locale: "en", messages, namespace: ns as never }),
  };
});

import { createProduct, setProductStatus, updateProduct } from "@/server/actions/products";
import { uploadProductImage } from "@/server/actions/product-images";
import { createSupplier, quickAddSupplier, setSupplierActive, updateSupplier } from "@/server/actions/suppliers";
import { findDuplicateInvoice, saveEntry } from "@/server/actions/entries";
import { applyProductImport, previewProductImport } from "@/server/actions/product-import";
import { GET as productImage } from "@/app/api/product-images/[id]/route";
import { GET as productsExport } from "@/app/(app)/admin/products/export/route";
import { POST as importErrors } from "@/app/(app)/admin/products/import/errors/route";
import { emptyEntryForm } from "@/lib/validation/entries";
import { createEntry } from "@/server/stock/createEntry";
import { voidEntry } from "@/server/stock/voidEntry";
import { listProducts } from "@/server/queries/products";
import { lowStock } from "@/server/queries/reports";
import type { Role } from "@/generated/prisma/enums";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { level } from "../helpers/ledger";
import { signInAs } from "../helpers/auth";

type User = Awaited<ReturnType<typeof makeUser>>;
const actor = (u: User) => ({ id: u.id, role: u.role as Role, warehouseIds: u.warehouses.map((w) => w.id) });
const viewer = (u: User) => ({ ...actor(u), name: u.name, email: u.email, mustChangePassword: false });

let main: string;
let jeddah: string;
let damaged: string;
let admin: User;

const productForm = (extra: Record<string, unknown> = {}) => ({
  modelCode: "HMD-900",
  sku: "",
  barcode: "",
  nameEn: "Mount",
  nameAr: "حامل",
  category: "wall-mount",
  status: "ACTIVE",
  variant: "",
  sizeRange: "32–70″",
  colour: "Black",
  maxLoadKg: "45",
  vesa: "600×400",
  imageUrl: "",
  cost: "85",
  sellingPrice: "199",
  lowStockLevel: "5",
  leadTimeDays: "14",
  wooProductId: "",
  wooSku: "",
  defaultSupplierId: "",
  reorder: [] as { warehouseId: string; reorderLevel: string; reorderQty: string }[],
  ...extra,
});
const stockIn = (productId: string, quantity: number, warehouseId = main) =>
  createEntry(testDb, actor(admin), {
    direction: "IN",
    reason: "SUPPLIER_DELIVERY",
    warehouseId,
    supplierName: "x",
    reference: "INV",
    lines: [{ productId, quantity }],
  });
const stockOut = (productId: string, quantity: number) =>
  createEntry(testDb, actor(admin), {
    direction: "OUT",
    reason: "DIRECT_SALE",
    warehouseId: main,
    customerName: "A",
    customerPhone: "0501234567",
    lines: [{ productId, quantity }],
  });
const jpeg = (bytes = 200) => new File([new Uint8Array([0xff, 0xd8, 0xff, ...new Array(bytes).fill(1)])], "p.jpg", { type: "image/jpeg" });

beforeEach(async () => {
  await resetDatabase();
  main = (await makeWarehouse("SELLABLE", "Riyadh Main")).id;
  jeddah = (await makeWarehouse("SELLABLE", "Jeddah")).id;
  damaged = (await makeWarehouse("DAMAGED", "Damaged")).id;
  admin = await makeUser("ADMIN");
  signInAs(admin);
});
afterAll(() => testDb.$disconnect());

describe("products", () => {
  it("creates a product with attributes, levels and a first cost record; SKU defaults to the model code", async () => {
    const result = await createProduct(productForm({ reorder: [{ warehouseId: main, reorderLevel: "3", reorderQty: "10" }, { warehouseId: jeddah, reorderLevel: "", reorderQty: "" }] }));
    expect(result.ok).toBe(true);
    const p = await testDb.product.findUniqueOrThrow({ where: { modelCode: "HMD-900" }, include: { reorder: true, costs: true } });
    expect(p).toMatchObject({ sku: "HMD-900", sizeRange: "32–70″", colour: "Black", maxLoadKg: 45, vesa: "600×400", leadTimeDays: 14, status: "ACTIVE" });
    expect(p.sellingPrice?.toFixed(2)).toBe("199.00");
    expect(p.reorder).toEqual([{ productId: p.id, warehouseId: main, reorderLevel: 3, reorderQty: 10 }]);
    expect(p.costs).toHaveLength(1);
    expect(p.costs[0]).toMatchObject({ source: "MANUAL", changedById: admin.id });
  });

  it("keeps SKU and barcode unique", async () => {
    await createProduct(productForm({ sku: "sku-1", barcode: "628100" }));
    expect(await createProduct(productForm({ modelCode: "HMD-901", sku: "SKU-1" }))).toMatchObject({ ok: false, error: "products.errors.skuTaken" });
    expect(await createProduct(productForm({ modelCode: "HMD-901", barcode: "628100" }))).toMatchObject({ ok: false, error: "products.errors.barcodeTaken" });
    expect(await createProduct(productForm({ modelCode: "HMD-901", barcode: "62 81" }))).toMatchObject({ ok: false, fieldErrors: { barcode: "validation.code" } });
  });

  it("adds to the cost history only when the cost changes", async () => {
    await createProduct(productForm());
    const p = await testDb.product.findUniqueOrThrow({ where: { modelCode: "HMD-900" } });
    expect((await updateProduct(p.id, productForm({ cost: "85.00", nameEn: "Renamed" }))).ok).toBe(true);
    expect(await testDb.productCost.count({ where: { productId: p.id } })).toBe(1);
    await updateProduct(p.id, productForm({ cost: "90" }));
    await updateProduct(p.id, productForm({ cost: "" }));
    const costs = await testDb.productCost.findMany({ where: { productId: p.id }, orderBy: { at: "asc" } });
    expect(costs.map((c) => c.cost?.toFixed(2) ?? null)).toEqual(["85.00", "90.00", null]);
  });

  it("applies the status rules: discontinued can leave but not come in; inactive needs zero stock and never moves", async () => {
    const p = await makeProduct("ST-1");
    await stockIn(p.id, 2);
    expect(await setProductStatus(p.id, "INACTIVE")).toMatchObject({ ok: false, error: "products.errors.retireHasStock" });
    expect((await setProductStatus(p.id, "DISCONTINUED")).ok).toBe(true);
    await expect(stockIn(p.id, 1)).rejects.toMatchObject({ key: "stock.errors.productInactive" });
    await stockOut(p.id, 2);
    expect((await setProductStatus(p.id, "INACTIVE")).ok).toBe(true);
    await expect(stockOut(p.id, 1)).rejects.toMatchObject({ key: "stock.errors.productRetired" });
    await expect(stockIn(p.id, 1)).rejects.toMatchObject({ key: "stock.errors.productRetired" });
    const audit = await testDb.auditLog.findMany({ where: { subjectId: p.id }, orderBy: { at: "asc" } });
    expect(audit.map((a) => a.after)).toEqual([{ status: "DISCONTINUED" }, { status: "INACTIVE" }]);
    expect(await createProduct(productForm({ status: "INACTIVE" }))).toMatchObject({ ok: false, error: "products.errors.newInactive" });
  });

  it("never puts stock back onto an inactive product through a void", async () => {
    const p = await makeProduct("VOID-RET");
    await stockIn(p.id, 1);
    const sale = await stockOut(p.id, 1);
    expect((await setProductStatus(p.id, "INACTIVE")).ok).toBe(true);
    await expect(voidEntry(testDb, actor(admin), { entryId: sale.id, reason: "mistake" })).rejects.toMatchObject({
      key: "void.errors.productRetired",
    });
    expect(await level(p.id, main)).toBe(0);
    await setProductStatus(p.id, "DISCONTINUED");
    await voidEntry(testDb, actor(admin), { entryId: sale.id, reason: "mistake" });
    expect(await level(p.id, main)).toBe(1);
  });

  it("refuses an entry with an inactive supplier, even outside the form", async () => {
    const p = await makeProduct("SUP-OFF");
    const s = await testDb.supplier.create({ data: { nameEn: "Gone Co", active: false } });
    await expect(
      createEntry(testDb, actor(admin), { direction: "IN", reason: "SUPPLIER_DELIVERY", warehouseId: main, supplierId: s.id, reference: "X", lines: [{ productId: p.id, quantity: 1 }] }),
    ).rejects.toMatchObject({ key: "products.errors.unknownSupplier" });
  });

  it("never retires a product while stock arrives at the same moment", async () => {
    const p = await makeProduct("RACE-1");
    const [entry, retire] = await Promise.allSettled([stockIn(p.id, 1), setProductStatus(p.id, "INACTIVE")]);
    const after = await testDb.product.findUniqueOrThrow({ where: { id: p.id } });
    if (after.status === "INACTIVE") {
      expect(entry.status).toBe("rejected");
      expect(await level(p.id, main)).toBe(0);
    } else {
      expect(retire.status === "fulfilled" && !retire.value.ok).toBe(true);
      expect(await level(p.id, main)).toBe(1);
    }
  });

  it("uses per-warehouse reorder levels for low stock, and skips discontinued products", async () => {
    const a = await makeProduct("LOW-A");
    const b = await makeProduct("LOW-B");
    await testDb.product.update({ where: { id: a.id }, data: { lowStockLevel: 100 } });
    await testDb.productReorder.create({ data: { productId: a.id, warehouseId: main, reorderLevel: 3, reorderQty: 12 } });
    await testDb.product.update({ where: { id: b.id }, data: { lowStockLevel: 5 } });
    await stockIn(a.id, 3);
    await stockIn(a.id, 50, jeddah);
    await stockIn(b.id, 9);
    const r = await lowStock({});
    expect(r.rows.map((x) => [x.modelCode, x.lowWarehouseIds, x.suggestedQty])).toEqual([["LOW-A", [main], 12]]);
    await testDb.product.update({ where: { id: a.id }, data: { status: "DISCONTINUED" } });
    expect((await lowStock({})).rows).toEqual([]);
  });

  it("lists stock per warehouse with sellable / damaged totals, and value only for cost roles", async () => {
    const p = await makeProduct("LIST-1");
    await testDb.product.update({ where: { id: p.id }, data: { cost: "10.00" } });
    await stockIn(p.id, 4);
    await stockIn(p.id, 1, damaged);
    const asAdmin = await listProducts(viewer(admin), {});
    expect(asAdmin.rows[0]).toMatchObject({ sellable: 4, damaged: 1, cost: "10.00", value: "50.00", qty: { [main]: 4, [damaged]: 1 } });
    const asStaff = await listProducts(viewer(await makeUser("STAFF")), {});
    expect(JSON.stringify(asStaff.rows)).not.toContain("10.00");
    expect(asStaff.rows[0]).not.toHaveProperty("cost");
    expect(asStaff.rows[0]).not.toHaveProperty("value");
  });

  it("exports the list to Excel for admins only", async () => {
    await makeProduct("EXP-1");
    const res = await productsExport(new Request("http://x/admin/products/export"));
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    expect(wb.worksheets[0].getCell("A2").value).toBe("EXP-1");
    signInAs(await makeUser("MANAGER", [main]));
    expect((await productsExport(new Request("http://x/admin/products/export"))).status).toBe(403);
  });
});

describe("product images", () => {
  it("stores admin uploads, rejects files that aren't images and serves the thumbnail to signed-in users", async () => {
    const bad = new FormData();
    bad.set("file", new File(["<svg/>"], "x.jpg", { type: "image/jpeg" }));
    bad.set("thumb", jpeg());
    expect(await uploadProductImage(bad)).toMatchObject({ ok: false, error: "photo.errors.type" });

    const fd = new FormData();
    fd.set("file", jpeg(1000));
    fd.set("thumb", jpeg(100));
    const result = await uploadProductImage(fd);
    expect(result.ok).toBe(true);
    const url = (result as { data: { url: string } }).data.url;
    const id = url.split("/").pop()!;
    const ctx = { params: Promise.resolve({ id }) };

    signInAs(await makeUser("TECHNICIAN"));
    const thumb = await productImage(new Request(`http://x${url}?size=thumb`), ctx);
    expect(thumb.status).toBe(200);
    expect((await thumb.arrayBuffer()).byteLength).toBe(103);
    signInAs(null);
    expect((await productImage(new Request(`http://x${url}`), ctx)).status).toBe(401);

    signInAs(await makeUser("STAFF", [main]));
    expect(await uploadProductImage(fd)).toEqual({ ok: false, error: "errors.forbidden" });
  });

  it("links an uploaded image to the product through its path", async () => {
    const fd = new FormData();
    fd.set("file", jpeg());
    fd.set("thumb", jpeg());
    const url = ((await uploadProductImage(fd)) as { data: { url: string } }).data.url;
    expect((await createProduct(productForm({ imageUrl: url }))).ok).toBe(true);
    const p = await testDb.product.findUniqueOrThrow({ where: { modelCode: "HMD-900" } });
    expect(p.imageId).toBe(url.split("/").pop());
    expect(await createProduct(productForm({ modelCode: "X-2", imageUrl: "/api/product-images/doesnotexist01" }))).toMatchObject({
      ok: false,
      error: "validation.photo",
    });
  });
});

describe("suppliers", () => {
  it("lets admins and managers manage suppliers, not staff", async () => {
    expect((await createSupplier({ nameEn: "Acme", nameAr: "أكمي", phone: "050 123 4567", email: "", contactPerson: "", city: "", country: "", vatNumber: "", paymentTerms: "", notes: "" })).ok).toBe(true);
    const s = await testDb.supplier.findUniqueOrThrow({ where: { nameEn: "Acme" } });
    expect(s.phone).toBe("0501234567");
    signInAs(await makeUser("MANAGER", [main]));
    expect((await updateSupplier(s.id, { nameEn: "Acme Trading", phone: "", email: "", nameAr: "", contactPerson: "", city: "", country: "", vatNumber: "", paymentTerms: "30 days", notes: "" })).ok).toBe(true);
    signInAs(await makeUser("STAFF", [main]));
    expect(await setSupplierActive(s.id, false)).toEqual({ ok: false, error: "errors.forbidden" });
    expect(await testDb.auditLog.count({ where: { subjectType: "supplier" } })).toBe(2);
  });

  it("lets anyone recording deliveries add one inline, returning an existing one with the same name", async () => {
    signInAs(await makeUser("STAFF", [main]));
    const a = await quickAddSupplier({ nameEn: "New Co", phone: "" });
    const b = await quickAddSupplier({ nameEn: "new co", phone: "" });
    expect(a.ok && b.ok && a.data.id === b.data.id).toBe(true);
    signInAs(await makeUser("VIEWER"));
    expect(await quickAddSupplier({ nameEn: "Other", phone: "" })).toEqual({ ok: false, error: "errors.forbidden" });
  });

  it("saves the supplier on deliveries, refuses inactive ones and warns about a repeated invoice", async () => {
    const p = await makeProduct("SUP-1");
    const s = await testDb.supplier.create({ data: { nameEn: "Acme" } });
    const form = { ...emptyEntryForm("IN"), reason: "SUPPLIER_DELIVERY", warehouseId: main, supplierId: s.id, reference: "INV-7", lines: [{ productId: p.id, quantity: "2" }] };
    expect(await findDuplicateInvoice({ supplierId: s.id, reference: "INV-7" })).toEqual({ ok: true, data: null });
    const saved = await saveEntry(form);
    expect(saved).toMatchObject({ ok: true, data: { status: "saved" } });
    const entryId = (saved as { data: { entry: { id: string } } }).data.entry.id;
    expect(await testDb.stockEntry.findUniqueOrThrow({ where: { id: entryId } })).toMatchObject({ supplierId: s.id, supplierName: "Acme" });
    expect(await findDuplicateInvoice({ supplierId: s.id, reference: "inv-7" })).toMatchObject({ ok: true, data: { id: entryId } });
    await voidEntry(testDb, actor(admin), { entryId, reason: "typo" });
    expect(await findDuplicateInvoice({ supplierId: s.id, reference: "INV-7" })).toEqual({ ok: true, data: null });

    await testDb.supplier.update({ where: { id: s.id }, data: { active: false } });
    expect(await saveEntry(form)).toMatchObject({ ok: false, error: "products.errors.unknownSupplier" });
  });
});

describe("product import (Phase B columns)", () => {
  async function file(rows: (string | number)[][]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    rows.forEach((r) => ws.addRow(r));
    const fd = new FormData();
    fd.set("file", new File([await wb.xlsx.writeBuffer()], "products.xlsx"));
    return fd;
  }
  const head = ["modelCode", "sku", "barcode", "nameEn", "nameAr", "category", "sellingPrice", "supplier", "cost"];

  it("imports the new columns and records cost changes", async () => {
    await testDb.supplier.create({ data: { nameEn: "Acme" } });
    const fd = await file([head, ["IMP-1", "", "6281", "Mount", "حامل", "wall-mount", "150", "acme", "70"]]);
    expect(await previewProductImport(fd)).toMatchObject({ ok: true, data: { counts: { create: 1, error: 0 } } });
    expect(await applyProductImport(await file([head, ["IMP-1", "", "6281", "Mount", "حامل", "wall-mount", "150", "acme", "70"]]))).toMatchObject({ ok: true });
    const p = await testDb.product.findUniqueOrThrow({ where: { modelCode: "IMP-1" }, include: { costs: true } });
    expect(p).toMatchObject({ sku: "IMP-1", barcode: "6281", status: "ACTIVE" });
    expect(p.sellingPrice?.toFixed(2)).toBe("150.00");
    expect(p.costs.map((c) => c.source)).toEqual(["IMPORT"]);
  });

  it("downloads only the rows with errors, with an errors column", async () => {
    const fd = await file([head, ["OK-1", "", "", "A", "ب", "wall-mount", "", "", ""], ["BAD-1", "", "", "", "", "chairs", "", "", ""]]);
    const res = await importErrors(new Request("http://x/admin/products/import/errors", { method: "POST", body: fd, headers: { "sec-fetch-site": "same-origin" } }));
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    const ws = wb.worksheets[0];
    expect(ws.rowCount).toBe(2);
    expect(ws.getCell("B2").value).toBe("BAD-1");
    expect(String(ws.getRow(2).getCell(ws.columnCount).value)).toContain("category");
    const cross = await importErrors(new Request("http://x/admin/products/import/errors", { method: "POST", body: fd, headers: { "sec-fetch-site": "cross-site" } }));
    expect(cross.status).toBe(403);
  });
});
