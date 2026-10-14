/** v2 Phase A security: sign-in limits and history, forced password change, session validity, audit log. */
import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(), signIn: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "8.8.8.8" }) }));

import { signIn } from "@/auth";
import { SESSION_ABSOLUTE_MS } from "@/auth.config";
import { changeOwnPassword } from "@/server/actions/account";
import { createUser, resetUserPassword, updateUser } from "@/server/actions/users";
import { updateProduct } from "@/server/actions/products";
import { saveApprovalRulesAction } from "@/server/actions/settings";
import { getCurrentUser, requirePermission, sessionStillValid } from "@/server/auth/dal";
import {
  clientIp,
  finishLogin,
  isLoginBlocked,
  MAX_FAILURES_PER_EMAIL,
  MAX_FAILURES_PER_IP,
  recordLogin,
  startLogin,
} from "@/server/auth/login-limits";
import { makeProduct, makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { signInAs } from "../helpers/auth";

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(signIn).mockReset();
});
afterAll(() => testDb.$disconnect());

const fail = (email: string, ip: string | null = "1.1.1.1") => recordLogin(testDb, { email, ip, success: false, reason: "password" });

describe("sign-in limits", () => {
  it("blocks an email after 5 failed attempts in 15 minutes", async () => {
    for (let i = 0; i < MAX_FAILURES_PER_EMAIL - 1; i++) await fail("a@h.test", `10.0.0.${i}`);
    expect(await isLoginBlocked(testDb, "a@h.test", "9.9.9.9")).toBe(false);
    await fail("a@h.test", "10.0.0.9");
    expect(await isLoginBlocked(testDb, "a@h.test", "9.9.9.9")).toBe(true);
    expect(await isLoginBlocked(testDb, "other@h.test", "9.9.9.9")).toBe(false);
    // 15 minutes later the window has passed
    expect(await isLoginBlocked(testDb, "a@h.test", "9.9.9.9", new Date(Date.now() + 16 * 60_000))).toBe(false);
  });

  it("starts counting again after a successful sign-in, and ignores blocked attempts", async () => {
    const u = await makeUser("STAFF");
    for (let i = 0; i < 4; i++) await fail(u.email);
    await recordLogin(testDb, { email: u.email, ip: "1.1.1.1", userId: u.id, success: true });
    await new Promise((r) => setTimeout(r, 5));
    await fail(u.email);
    await recordLogin(testDb, { email: u.email, ip: "1.1.1.1", success: false, reason: "rateLimited" });
    expect(await isLoginBlocked(testDb, u.email, "1.1.1.1")).toBe(false);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: u.id } })).lastLoginAt).not.toBeNull();
  });

  it("blocks an IP address after 30 failed attempts across emails", async () => {
    await testDb.loginEvent.createMany({
      data: Array.from({ length: MAX_FAILURES_PER_IP }, (_, i) => ({ email: `x${i}@h.test`, ip: "6.6.6.6", success: false, reason: "password" })),
    });
    expect(await isLoginBlocked(testDb, "new@h.test", "6.6.6.6")).toBe(true);
    expect(await isLoginBlocked(testDb, "new@h.test", "7.7.7.7")).toBe(false);
  });

  it("lets only 5 of many attempts sent at the same moment check a password", async () => {
    const attempts = await Promise.all(Array.from({ length: 12 }, () => startLogin(testDb, "burst@h.test", null)));
    const allowed = attempts.filter((a) => !a.blocked);
    expect(allowed.length).toBeLessThanOrEqual(MAX_FAILURES_PER_EMAIL);
    expect(attempts.length - allowed.length).toBeGreaterThanOrEqual(12 - MAX_FAILURES_PER_EMAIL);
    // Afterwards only real failures count: fill up to the limit and the next try is blocked.
    for (const a of allowed) await finishLogin(testDb, a.id, { success: false, reason: "password" });
    for (let i = allowed.length; i < MAX_FAILURES_PER_EMAIL; i++) await fail("burst@h.test");
    expect((await startLogin(testDb, "burst@h.test", null)).blocked).toBe(true);
  });

  it("reads the client address the proxy appended, not one the client sent", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers({ "x-real-ip": "5.6.7.9" }))).toBe("5.6.7.9");
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("sessions", () => {
  it("ends after 24 hours and after a password change", () => {
    const now = Date.now();
    expect(sessionStillValid(now - 1000, null, now)).toBe(true);
    expect(sessionStillValid(now - SESSION_ABSOLUTE_MS - 1, null, now)).toBe(false);
    expect(sessionStillValid(now - 1000, new Date(now - 500), now)).toBe(false);
    expect(sessionStillValid(now - 1000, new Date(now - 5000), now)).toBe(true);
    expect(sessionStillValid(undefined, null, now)).toBe(false); // pre-v2 session: signed out once
  });

  it("signs a user out everywhere when an admin resets his password", async () => {
    const admin = await makeUser("ADMIN");
    const staff = await makeUser("STAFF");
    const signedInAt = Date.now() - 60_000;
    signInAs(staff, signedInAt);
    expect(await getCurrentUser()).not.toBeNull();
    signInAs(admin, Date.now());
    expect(await resetUserPassword(staff.id, { password: "brand-new-pass" })).toEqual({ ok: true, data: null });
    signInAs(staff, signedInAt);
    expect(await getCurrentUser()).toBeNull();
    const after = await testDb.user.findUniqueOrThrow({ where: { id: staff.id } });
    expect(after.mustChangePassword).toBe(true);
  });
});

describe("forced password change", () => {
  it("is required for new users, and every action redirects until it is done", async () => {
    const admin = await makeUser("ADMIN");
    const w = await makeWarehouse();
    signInAs(admin, Date.now());
    const created = await createUser({ name: "Ali", email: "ali@h.test", role: "STAFF", warehouseIds: [w.id], password: "first-pass-1" });
    expect(created.ok).toBe(true);
    const ali = await testDb.user.findUniqueOrThrow({ where: { email: "ali@h.test" } });
    expect(ali.mustChangePassword).toBe(true);

    signInAs(ali, Date.now() - 1000);
    await expect(requirePermission("entry:create")).rejects.toMatchObject({ digest: expect.stringContaining("/account/password") });

    expect(await changeOwnPassword({ current: "wrong-one", password: "second-pass-2", confirm: "second-pass-2" })).toMatchObject({
      ok: false,
      error: "account.errors.wrongCurrent",
    });
    expect(await testDb.loginEvent.count({ where: { userId: ali.id, success: false, reason: "password" } })).toBe(1);
    expect(await changeOwnPassword({ current: "first-pass-1", password: "second-pass-2", confirm: "second-pass-3" })).toMatchObject({
      ok: false,
      fieldErrors: { confirm: "account.errors.mismatch" },
    });
    expect(await changeOwnPassword({ current: "first-pass-1", password: "short", confirm: "short" })).toMatchObject({
      ok: false,
      fieldErrors: { password: "validation.passwordMin" },
    });
    expect(await changeOwnPassword({ current: "first-pass-1", password: "second-pass-2", confirm: "second-pass-2" })).toEqual({ ok: true, data: null });

    const changed = await testDb.user.findUniqueOrThrow({ where: { id: ali.id } });
    expect(changed.mustChangePassword).toBe(false);
    expect(await bcrypt.compare("second-pass-2", changed.passwordHash)).toBe(true);
    expect(vi.mocked(signIn)).toHaveBeenCalledWith("credentials", { email: "ali@h.test", password: "second-pass-2", redirect: false });
    signInAs(ali, Date.now() + 1);
    await expect(requirePermission("entry:create")).resolves.toMatchObject({ id: ali.id });
  });
});

describe("audit log", () => {
  it("records only the changed product fields, cost included", async () => {
    const admin = await makeUser("ADMIN");
    const p = await makeProduct("HMD-1");
    await testDb.product.update({ where: { id: p.id }, data: { cost: "12.50" } });
    signInAs(admin, Date.now());
    const form = {
      modelCode: "HMD-1",
      sku: "",
      barcode: "",
      nameEn: p.nameEn,
      nameAr: p.nameAr,
      category: "wall-mount",
      status: "ACTIVE",
      variant: "",
      sizeRange: "",
      colour: "",
      maxLoadKg: "",
      vesa: "",
      imageUrl: "",
      cost: "12.5",
      sellingPrice: "",
      lowStockLevel: "0",
      leadTimeDays: "",
      wooProductId: "",
      wooSku: "",
      defaultSupplierId: "",
      reorder: [],
    };
    expect(await updateProduct(p.id, form)).toMatchObject({ ok: true });
    expect(await testDb.auditLog.count()).toBe(0); // nothing changed ("12.5" = 12.50)
    expect(await updateProduct(p.id, { ...form, cost: "15", nameEn: "New name" })).toMatchObject({ ok: true });
    const row = await testDb.auditLog.findFirstOrThrow();
    expect(row).toMatchObject({ action: "product.update", subjectType: "product", subjectId: p.id, subjectLabel: "HMD-1", actorId: admin.id });
    expect(row.before).toEqual({ cost: "12.50", nameEn: p.nameEn });
    expect(row.after).toEqual({ cost: "15.00", nameEn: "New name" });
  });

  it("records role and warehouse changes by name, and settings changes", async () => {
    const admin = await makeUser("ADMIN");
    const w = await makeWarehouse("SELLABLE", "Riyadh Main");
    const u = await makeUser("STAFF", [w.id]);
    signInAs(admin, Date.now());
    expect(await updateUser(u.id, { name: u.name, email: u.email, role: "MANAGER", warehouseIds: [w.id] })).toMatchObject({ ok: true });
    const userRow = await testDb.auditLog.findFirstOrThrow({ where: { action: "user.update" } });
    expect(userRow.before).toEqual({ role: "STAFF" });
    expect(userRow.after).toEqual({ role: "MANAGER" });

    const rules = { maxUnits: "0", maxValue: "" };
    expect(await saveApprovalRulesAction({ correction: { maxUnits: "5", maxValue: "500" }, damaged: rules, void: rules })).toMatchObject({ ok: true });
    const settingRow = await testDb.auditLog.findFirstOrThrow({ where: { action: "setting.update" } });
    expect(settingRow.after).toEqual({ correction: { maxUnits: 5, maxValue: "500" } });
  });
});
