/** Plan ui-menu-import-categories: managed categories, several per product, import with column matching. */
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCategory, deleteCategory, setCategoryActive, updateCategory } from "@/server/actions/categories";
import { createProduct, updateProduct } from "@/server/actions/products";
import { applyProductImport, previewProductImport, readProductImportColumns } from "@/server/actions/product-import";
import { listProducts } from "@/server/queries/products";
import { stockOnHand } from "@/server/queries/reports";
import { getProductForEdit } from "@/server/queries/products";
import type { Role } from "@/generated/prisma/enums";
import { makeProduct, makeUser, resetDatabase, testDb } from "../helpers/db";
import { signInAs } from "../helpers/auth";

type User = Awaited<ReturnType<typeof makeUser>>;
let admin: User;
const viewer = (u: User) => ({ id: u.id, role: u.role as Role, warehouseIds: [], name: u.name, email: u.email, mustChangePassword: false });

const productForm = (extra: Record<string, unknown> = {}) => ({
  modelCode: "HMD-900",
  sku: "",
  barcode: "",
  nameEn: "Mount",
  nameAr: "حامل",
  categoryIds: ["cat-wall-mount"],
  status: "ACTIVE",
  variant: "",
  sizeRange: "",
  colour: "",
  maxLoadKg: "",
  vesa: "",
  imageUrl: "",
  cost: "",
  sellingPrice: "",
  lowStockLevel: "0",
  leadTimeDays: "",
  wooProductId: "",
  wooSku: "",
  defaultSupplierId: "",
  reorder: [],
  ...extra,
});
const categoriesOf = async (modelCode: string) =>
  (
    await testDb.productCategory.findMany({ where: { product: { modelCode } }, orderBy: { position: "asc" }, select: { categoryId: true } })
  ).map((c) => c.categoryId);

async function upload(rows: (string | number)[][], mapping?: Record<string, string>) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  rows.forEach((r) => ws.addRow(r));
  const fd = new FormData();
  fd.set("file", new File([await wb.xlsx.writeBuffer()], "supplier-list.xlsx"));
  if (mapping) fd.set("mapping", JSON.stringify(mapping));
  return fd;
}

beforeEach(async () => {
  await resetDatabase();
  admin = await makeUser("ADMIN");
  signInAs(admin);
});
afterAll(() => testDb.$disconnect());

describe("categories", () => {
  it("starts with the four default categories and every existing product keeps one", async () => {
    expect(await testDb.category.count()).toBe(4);
    const p = await makeProduct("HMD-1");
    expect(await categoriesOf("HMD-1")).toEqual(["cat-wall-mount"]);
    void p;
  });

  it("adds, renames, hides and deletes (unused only); names are unique; audited; ADMIN only", async () => {
    const created = await createCategory({ nameEn: "Ceiling mounts", nameAr: "حوامل سقف", position: "5" });
    expect(created).toMatchObject({ ok: true, data: { nameEn: "Ceiling mounts" } });
    const id = (created as { data: { id: string } }).data.id;
    expect(await createCategory({ nameEn: "ceiling MOUNTS", nameAr: "أخرى", position: "6" })).toMatchObject({ ok: false, error: "categories.errors.nameTaken" });
    expect(await updateCategory(id, { nameEn: "Ceiling brackets", nameAr: "حوامل سقف", position: "2" })).toMatchObject({ ok: true });

    await createProduct(productForm({ categoryIds: [id] }));
    expect(await deleteCategory(id)).toMatchObject({ ok: false, error: "categories.errors.inUse", params: { count: 1 } });
    expect(await setCategoryActive(id, false)).toMatchObject({ ok: true });
    expect(await testDb.category.findUniqueOrThrow({ where: { id } })).toMatchObject({ nameEn: "Ceiling brackets", active: false, position: 2 });

    const unused = (await createCategory({ nameEn: "Typo", nameAr: "خطأ", position: "9" })) as { data: { id: string } };
    expect(await deleteCategory(unused.data.id)).toMatchObject({ ok: true });
    expect(await testDb.category.count({ where: { id: unused.data.id } })).toBe(0);
    expect(await testDb.auditLog.findMany({ where: { subjectType: "category" }, select: { action: true }, orderBy: { at: "asc" } })).toEqual([
      { action: "category.create" },
      { action: "category.update" },
      { action: "category.deactivate" },
      { action: "category.create" },
      { action: "category.delete" },
    ]);

    signInAs(await makeUser("MANAGER"));
    expect(await createCategory({ nameEn: "X", nameAr: "س", position: "1" })).toMatchObject({ ok: false, error: "errors.forbidden" });
  });
});

describe("products with several categories", () => {
  it("saves them in the order picked, filters lists and reports by any of them, audits by name", async () => {
    expect(await createProduct(productForm({ categoryIds: ["cat-tv-table", "cat-floor-stand"] }))).toMatchObject({ ok: true });
    expect(await categoriesOf("HMD-900")).toEqual(["cat-tv-table", "cat-floor-stand"]);
    const p = await testDb.product.findUniqueOrThrow({ where: { modelCode: "HMD-900" } });
    expect((await getProductForEdit(p.id))?.values.categoryIds).toEqual(["cat-tv-table", "cat-floor-stand"]);

    const user = viewer(admin);
    expect((await listProducts(user, { category: "cat-floor-stand" })).rows.map((r) => r.modelCode)).toEqual(["HMD-900"]);
    expect((await listProducts(user, { category: "cat-wall-mount" })).rows).toEqual([]);
    expect((await stockOnHand(user, { category: "cat-tv-table" })).rows.map((r) => [r.modelCode, r.categories.map((c) => c.nameEn)])).toEqual([
      ["HMD-900", ["TV tables", "Floor stands"]],
    ]);

    expect(await updateProduct(p.id, productForm({ categoryIds: ["cat-floor-stand"] }))).toMatchObject({ ok: true });
    expect(await categoriesOf("HMD-900")).toEqual(["cat-floor-stand"]);
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "product.update" } });
    expect(log.before).toMatchObject({ categories: ["TV tables", "Floor stands"] });
    expect(log.after).toMatchObject({ categories: ["Floor stands"] });
  });

  it("needs at least one, refuses unknown and hidden categories, but a product keeps a hidden one it has", async () => {
    expect(await createProduct(productForm({ categoryIds: [] }))).toMatchObject({ ok: false, fieldErrors: { categoryIds: "products.errors.categoryRequired" } });
    expect(await createProduct(productForm({ categoryIds: ["nope"] }))).toMatchObject({ ok: false, error: "products.errors.unknownCategory" });
    await createProduct(productForm());
    await setCategoryActive("cat-tv-table", false);
    expect(await createProduct(productForm({ modelCode: "HMD-901", categoryIds: ["cat-tv-table"] }))).toMatchObject({
      ok: false,
      error: "products.errors.unknownCategory",
    });
    // the product already in the (now hidden) wall-mount category can still be saved with it
    await setCategoryActive("cat-wall-mount", false);
    const p = await testDb.product.findUniqueOrThrow({ where: { modelCode: "HMD-900" } });
    expect(await updateProduct(p.id, productForm({ nameEn: "Renamed" }))).toMatchObject({ ok: true });
  });
});

describe("import with column matching (PU3, PU4)", () => {
  const rows = [
    ["Hamood supplier list"],
    ["Item Code", "Product Name", "الاسم", "Category", "Price", "Remarks"],
    ["HMD-900", "Floor stand", "ستاند أرضي", "Floor stands; Ceiling mounts", "1,250", "x"],
    ["hmd-1", "", "", "طاولات تلفزيون", "", ""],
  ];

  it("suggests the columns, previews with the user's choices, creates new categories and replaces an existing product's categories", async () => {
    await makeProduct("HMD-1");
    const cols = await readProductImportColumns(await upload(rows));
    expect(cols).toMatchObject({
      ok: true,
      data: {
        rowCount: 2,
        mapping: { "0": "modelcode", "1": "nameen", "2": "namear", "3": "category", "4": "sellingprice", "5": "" },
      },
    });
    const columns = (cols as { data: { columns: { label: string; samples: string[] }[] } }).data.columns;
    expect(columns[1]).toMatchObject({ label: "Product Name", samples: ["Floor stand", ""] });

    // the user decides the remarks are "other details"
    const mapping = { "0": "modelcode", "1": "nameen", "2": "namear", "3": "category", "4": "sellingprice", "5": "variant" };
    const preview = await previewProductImport(await upload(rows, mapping));
    expect(preview).toMatchObject({
      ok: true,
      data: { counts: { create: 1, update: 1, error: 0 }, newCategories: ["Ceiling mounts"], categoryNames: { "cat-floor-stand": { nameEn: "Floor stands" } } },
    });
    expect(await testDb.category.count()).toBe(4); // the preview writes nothing

    expect(await applyProductImport(await upload(rows, mapping))).toEqual({ ok: true, data: { created: 1, updated: 1, categories: 1, warehouses: 0, entries: [] } });
    const ceiling = await testDb.category.findUniqueOrThrow({ where: { nameEn: "Ceiling mounts" } });
    expect(ceiling).toMatchObject({ nameAr: "Ceiling mounts", active: true });
    expect(await categoriesOf("HMD-900")).toEqual(["cat-floor-stand", ceiling.id]);
    expect(await testDb.product.findUniqueOrThrow({ where: { modelCode: "HMD-900" } })).toMatchObject({ variant: "x", nameAr: "ستاند أرضي" });
    expect(await categoriesOf("HMD-1")).toEqual(["cat-tv-table"]); // replaced
  });

  it("won't link a hidden category (a product keeps one it has), and treats accents like the database", async () => {
    await makeProduct("HMD-1"); // in TV wall mounts
    await setCategoryActive("cat-wall-mount", false);
    const head = ["Model", "Name", "Arabic name", "Category"];
    const preview = await previewProductImport(
      await upload([head, ["NEW-1", "a", "ب", "TV wall mounts"], ["HMD-1", "", "", "TV wall mounts, Floor stands"], ["NEW-2", "a", "ب", "Café, cafe"]]),
    );
    expect(preview).toMatchObject({ ok: true, data: { counts: { create: 1, update: 1, error: 1 }, newCategories: ["Café"] } });
    const rows = (preview as { data: { rows: { modelCode: string; errors: { key: string }[] }[] } }).data.rows;
    expect(rows[0].errors).toEqual([{ field: "category", key: "import.errors.hiddenCategory" }]);
  });

  it("refuses a field chosen twice, and a mapping for columns the file doesn't have", async () => {
    expect(await previewProductImport(await upload(rows, { "0": "modelcode", "1": "modelcode" }))).toMatchObject({ ok: false, error: "import.errors.duplicateField" });
    expect(await previewProductImport(await upload(rows, { "0": "modelcode", "9": "nameen" }))).toMatchObject({ ok: false, error: "import.errors.columnsChanged" });
    expect(await previewProductImport(await upload(rows, { "0": "password" }))).toMatchObject({ ok: false, error: "errors.invalidInput" });
  });
});
