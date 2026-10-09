import { describe, expect, it } from "vitest";
import { checkFile } from "../scripts/check-rules.mjs";

type Violation = { rule: string; severity: string; line: number };
const rules = (file: string, src: string) =>
  (checkFile(file, src) as Violation[]).map((v) => `${v.severity}:${v.rule}`);

describe("stocklevel-write", () => {
  it("flags Prisma writes to StockLevel outside the entry service", () => {
    expect(rules("src/server/actions/x.ts", "await db.stockLevel.update({})")).toContain("error:stocklevel-write");
    expect(rules("prisma/seed.ts", "tx.stockLevel.upsert({})")).toContain("error:stocklevel-write");
  });

  it("flags raw SQL writes to StockLevel", () => {
    expect(rules("src/lib/x.ts", 'tx.$executeRaw`UPDATE "StockLevel" SET quantity = 0`')).toContain(
      "error:stocklevel-write",
    );
  });

  it("allows reads anywhere and writes inside src/server/stock/", () => {
    expect(rules("src/server/actions/x.ts", "db.stockLevel.findMany()")).toEqual([]);
    expect(rules("src/server/stock/createEntry.ts", 'UPDATE "StockLevel" SET quantity = quantity - 1')).toEqual(
      [],
    );
  });

  it("honours a rules-allow comment on the line above", () => {
    const src = "// rules-allow: stocklevel-write — test fixture\ndb.stockLevel.update({})";
    expect(rules("tests/x.test.ts", src)).toEqual([]);
  });
});

describe("ledger-mutation and hard-delete", () => {
  it("flags updates to saved entries outside the service", () => {
    expect(rules("src/server/actions/x.ts", "db.stockEntry.update({})")).toContain("error:ledger-mutation");
    expect(rules("src/server/actions/x.ts", "db.stockEntryLine.updateMany({})")).toContain(
      "error:ledger-mutation",
    );
  });

  it("flags hard deletes everywhere, even in the service", () => {
    for (const model of ["stockEntry", "stockEntryLine", "product", "user", "warehouse"]) {
      expect(rules("src/server/stock/x.ts", `db.${model}.delete({})`)).toContain("error:hard-delete");
    }
    expect(rules("scripts/x.mjs", 'DELETE FROM "Product"')).toContain("error:hard-delete");
  });

  it("does not flag deactivation", () => {
    expect(rules("src/server/actions/x.ts", "db.product.update({ data: { active: false } })")).toEqual([]);
  });
});

describe("action-auth", () => {
  const head = '"use server";\n\nimport { requireUser } from "@/server/auth/dal";\n\n';

  it("flags an exported server action without an auth call", () => {
    const src = `${head}export async function saveThing() {\n  return 1;\n}\n`;
    expect(rules("src/server/actions/x.ts", src)).toEqual(["error:action-auth"]);
  });

  it("passes when every action calls the DAL", () => {
    const src = `${head}export async function a() {\n  await requireUser();\n}\nexport async function b() {\n  await requirePermission("entry:void");\n}\n`;
    expect(rules("src/server/actions/x.ts", src)).toEqual([]);
  });

  it("checks each function separately", () => {
    const src = `${head}export async function a() {\n  await requireUser();\n}\nexport async function b() {\n  return 2;\n}\n`;
    const v = checkFile("src/server/actions/x.ts", src) as Violation[];
    expect(v).toHaveLength(1);
    expect(v[0].line).toBe(8);
  });

  it("ignores files that are not server action modules", () => {
    expect(rules("src/lib/x.ts", "export async function a() { return 1 }")).toEqual([]);
  });
});

describe("route-auth", () => {
  it("flags a route handler without an auth check", () => {
    expect(rules("src/app/api/export/route.ts", "export async function GET() {}")).toEqual(["error:route-auth"]);
  });

  it("skips the Auth.js route and passes guarded routes", () => {
    expect(rules("src/app/api/auth/[...nextauth]/route.ts", "export const { GET } = handlers")).toEqual([]);
    expect(rules("src/app/api/x/route.ts", "const user = await getCurrentUser();")).toEqual([]);
    expect(rules("src/app/x/template/route.ts", 'const denied = await routeGuard("product:manage");')).toEqual([]);
  });
});

describe("hardcoded-text", () => {
  it("warns about literal JSX text", () => {
    expect(rules("src/app/x/page.tsx", "return <h1>Products</h1>")).toEqual(["warning:hardcoded-text"]);
    expect(rules("src/components/x.tsx", "return <p>المنتجات</p>")).toEqual(["warning:hardcoded-text"]);
  });

  it("does not warn about translated text, shadcn primitives or TS generics", () => {
    expect(rules("src/app/x/page.tsx", "return <h1>{t('title')}</h1>")).toEqual([]);
    expect(rules("src/components/ui/button.tsx", "<span>Close</span>")).toEqual([]);
    expect(rules("src/components/x.tsx", "const c = createContext<Promise<User> | null>(null)")).toEqual([]);
    expect(rules("src/components/x.tsx", "action: () => Promise<ActionResult<unknown>>;")).toEqual([]);
    expect(rules("src/components/x.tsx", "form: UseFormReturn<T, C, R>,\n  result: Extract<X, Y>,")).toEqual([]);
  });

  it("still warns about multi-line JSX text that contains a colon", () => {
    expect(rules("src/app/x/page.tsx", "<p>\n  Warning: stock will be added\n</p>")).toEqual(["warning:hardcoded-text"]);
  });
});
