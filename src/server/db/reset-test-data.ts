/**
 * One-time "clear the test data" for a Hostinger deployment, where there is no shell (owner's request,
 * docs/plans/reset-test-data.md). Runs at start-up from bootstrap.ts only when RESET_TEST_DATA is set:
 *
 *   RESET_TEST_DATA=<any word of 8+ characters, e.g. clear-2026-10-23>
 *   RESET_LOGIN_PASSWORD=<temporary password for the test logins, 8+ characters>
 *
 * It then, once per RESET_TEST_DATA value (remembered in the Setting table, so a value left in the hosting
 * settings never clears real data on a later restart):
 *   1. deletes every stock entry, stock level, approval request, cost, photo, product, category, supplier and
 *      warehouse in ONE transaction, and sets the entry / SKU counters back to 0;
 *   2. recreates the default categories and warehouses;
 *   3. creates one login per role — <role>@hamoodtv.com — who must choose their own password at first sign-in.
 *      An account that already exists with one of these emails is never changed (its password stays); a
 *      manager / staff one only gets the new warehouses assigned again.
 * Users, the audit log, sign-in history and settings are kept. This is the ONE place allowed to delete
 * ledger rows: it starts the ledger over (levels go with the entries, so it stays rebuildable).
 */
import bcrypt from "bcryptjs";
import type mariadb from "mariadb";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { COUNTER_KEYS } from "@/lib/stock/numbering";
import { DEFAULT_WAREHOUSES, ensureBaseData } from "./base-data";

export const RESET_SETTING_KEY = "testDataReset";

/** Children first (the transaction also turns foreign-key checks off, so self-links don't matter). */
export const RESET_TABLES = [
  "LineCost",
  "EntryAttachment",
  "SupplierReturn",
  "ApprovalRequest",
  "StockEntryLine",
  "StockEntry",
  "StockLevel",
  "ProductCost",
  "ProductReorder",
  "Attachment",
  "_UserWarehouses",
  "ProductCategory",
  "Product",
  "ProductImage",
  "Category",
  "Supplier",
  "Warehouse",
] as const;

export const TEST_LOGINS: { role: Role; name: string; email: string; warehouses: "none" | "main" | "all" }[] = [
  { role: "ADMIN", name: "Admin", email: "admin@hamoodtv.com", warehouses: "none" },
  { role: "MANAGER", name: "Manager", email: "manager@hamoodtv.com", warehouses: "all" },
  { role: "STAFF", name: "Staff", email: "staff@hamoodtv.com", warehouses: "main" },
  { role: "TECHNICIAN", name: "Technician", email: "technician@hamoodtv.com", warehouses: "none" },
  { role: "ACCOUNTANT", name: "Accountant", email: "accountant@hamoodtv.com", warehouses: "none" },
  { role: "VIEWER", name: "Viewer", email: "viewer@hamoodtv.com", warehouses: "none" },
];

export type ResetRequest = { token?: string; password?: string };

export function resetRequestFromEnv(env: NodeJS.ProcessEnv = process.env): ResetRequest {
  return { token: env.RESET_TEST_DATA?.trim(), password: env.RESET_LOGIN_PASSWORD };
}

/** Returns what was done: "skipped" (not asked / already done for this value / bad settings) or "reset". */
export async function resetTestData(
  conn: mariadb.Connection,
  db: PrismaClient,
  request: ResetRequest,
  log: (m: string) => void = () => {},
): Promise<"skipped" | "reset"> {
  const { token, password } = request;
  if (!token) return "skipped";
  if (token.length < 8 || !password || password.length < 8) {
    log("RESET_TEST_DATA is set but ignored: it and RESET_LOGIN_PASSWORD must both be at least 8 characters");
    return "skipped";
  }

  // Two server processes starting together: only one resets.
  const [{ got }] = await conn.query<{ got: number | bigint | null }[]>("SELECT GET_LOCK('hamood_reset_test_data', 60) AS got");
  if (Number(got) !== 1) throw new Error("could not get the reset lock");
  try {
    const [done] = await conn.query<{ value: unknown }[]>("SELECT `value` FROM `Setting` WHERE `key` = ?", [RESET_SETTING_KEY]);
    if (done && settingToken(done.value) === token) {
      log(`test data was already cleared for RESET_TEST_DATA=${token} — remove RESET_TEST_DATA from the settings`);
      return "skipped";
    }

    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
      await conn.beginTransaction();
      for (const table of RESET_TABLES) {
        // rules-allow: hard-delete — owner-requested one-time clearing of test data before go-live (file header)
        await conn.query(`DELETE FROM \`${table}\``);
      }
      // Entry, request and SKU numbers start again from 1
      await conn.query(`UPDATE \`Counter\` SET \`value\` = 0 WHERE \`key\` IN (${COUNTER_KEYS.map(() => "?").join(", ")})`, [...COUNTER_KEYS]);
      for (const c of DEFAULT_CATEGORIES) {
        await conn.query("INSERT INTO `Category` (`id`, `nameEn`, `nameAr`, `active`, `position`, `createdAt`) VALUES (?, ?, ?, true, ?, NOW(3))", [
          c.id,
          c.nameEn,
          c.nameAr,
          c.position,
        ]);
      }
      await conn.query(
        "INSERT INTO `Setting` (`key`, `value`, `updatedAt`) VALUES (?, ?, NOW(3)) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updatedAt` = NOW(3)",
        [RESET_SETTING_KEY, JSON.stringify({ token, at: new Date().toISOString() })],
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    }
    log(`cleared the test data (${RESET_TABLES.length} tables) and restarted the entry and SKU numbers`);

    await ensureBaseData(db, {}, log); // default warehouses (users exist, so no first admin)
    const warehouses = await db.warehouse.findMany({ select: { id: true, name: true } });
    const main = warehouses.filter((w) => w.name === DEFAULT_WAREHOUSES[0].name);
    const hash = await bcrypt.hash(password, 12);
    let adminId: string | null = null;
    const created: string[] = [];
    const kept: string[] = [];
    for (const login of TEST_LOGINS) {
      const assigned = login.warehouses === "all" ? warehouses : login.warehouses === "main" ? main : [];
      const existing = await db.user.findUnique({ where: { email: login.email }, select: { id: true, role: true } });
      if (existing) {
        // Never touch a real account's password; only give a manager / staff back their warehouses.
        if (existing.role === login.role && assigned.length) {
          await db.user.update({ where: { id: existing.id }, data: { warehouses: { set: assigned.map((w) => ({ id: w.id })) } } });
        }
        kept.push(login.email);
        if (login.role === "ADMIN" && existing.role === "ADMIN") adminId = existing.id;
        continue;
      }
      const user = await db.user.create({
        data: {
          name: login.name,
          email: login.email,
          role: login.role,
          passwordHash: hash,
          mustChangePassword: true,
          warehouses: { connect: assigned.map((w) => ({ id: w.id })) },
        },
        select: { id: true },
      });
      created.push(login.email);
      if (login.role === "ADMIN") adminId = user.id;
    }
    adminId ??= (await db.user.findFirst({ where: { role: "ADMIN", active: true }, select: { id: true } }))?.id ?? null;
    if (adminId) {
      await db.auditLog.create({
        data: { actorId: adminId, action: "system.resetTestData", subjectType: "system", subjectLabel: token.slice(0, 200) },
      });
    }
    if (created.length) log(`logins created: ${created.join(", ")} (temporary password = RESET_LOGIN_PASSWORD)`);
    if (kept.length) log(`logins already there, left as they are: ${kept.join(", ")}`);
    return "reset";
  } finally {
    await conn.query("SELECT RELEASE_LOCK('hamood_reset_test_data')");
  }
}

function settingToken(value: unknown): string | null {
  const v = typeof value === "string" ? safeParse(value) : value;
  return v && typeof v === "object" && "token" in v ? String((v as { token: unknown }).token) : null;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
