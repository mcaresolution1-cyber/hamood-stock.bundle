import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import bcrypt from "bcryptjs";
import { createUser, resetUserPassword, setUserActive, updateUser } from "@/server/actions/users";
import { getCurrentUser } from "@/server/auth/dal";
import { makeUser, makeWarehouse, resetDatabase, testDb } from "../helpers/db";
import { signInAs } from "../helpers/auth";

let admin: Awaited<ReturnType<typeof makeUser>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await makeUser("ADMIN");
  signInAs(admin);
});
afterAll(() => testDb.$disconnect());

describe("users", () => {
  it("creates a STAFF user with hashed password and assigned warehouses", async () => {
    const w = await makeWarehouse();
    const result = await createUser({ name: "Ali", email: " ALI@Hamood.test ", role: "STAFF", warehouseIds: [w.id], password: "secret123" });
    expect(result.ok).toBe(true);
    const u = await testDb.user.findUniqueOrThrow({ where: { email: "ali@hamood.test" }, include: { warehouses: true } });
    expect(u.warehouses.map((x) => x.id)).toEqual([w.id]);
    expect(await bcrypt.compare("secret123", u.passwordHash)).toBe(true);
  });

  it("drops warehouse assignments for non-STAFF roles and rejects duplicate emails", async () => {
    const w = await makeWarehouse();
    await createUser({ name: "V", email: "v@h.test", role: "VIEWER", warehouseIds: [w.id], password: "secret123" });
    const v = await testDb.user.findUniqueOrThrow({ where: { email: "v@h.test" }, include: { warehouses: true } });
    expect(v.warehouses).toEqual([]);
    expect(await createUser({ name: "V2", email: "v@h.test", role: "VIEWER", warehouseIds: [], password: "secret123" })).toMatchObject({
      ok: false,
      error: "users.errors.emailTaken",
    });
  });

  it("returns field errors for invalid input", async () => {
    const result = await createUser({ name: "", email: "nope", role: "STAFF", warehouseIds: [], password: "short" });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { name: "validation.required", email: "validation.email", password: "validation.passwordMin" },
    });
  });

  it("won't let an admin remove their own admin access", async () => {
    expect(await setUserActive(admin.id, false)).toMatchObject({ ok: false, error: "users.errors.self" });
    expect(await updateUser(admin.id, { name: admin.name, email: admin.email, role: "STAFF", warehouseIds: [] })).toMatchObject({
      ok: false,
      error: "users.errors.self",
    });
  });

  it("lets an admin deactivate another admin, so there is always at least one active admin", async () => {
    // The acting admin is always active and can't remove themselves (users.errors.self), so removing
    // *another* admin always leaves at least one. users.errors.lastAdmin is a backstop for races.
    const other = await makeUser("ADMIN");
    expect(await setUserActive(other.id, false)).toEqual({ ok: true, data: null });
    expect(await testDb.user.count({ where: { role: "ADMIN", active: true } })).toBe(1);
    signInAs(other); // deactivated: their next action is sent to the login page
    await expect(setUserActive(admin.id, false)).rejects.toThrow("NEXT_REDIRECT");
    expect((await testDb.user.findUniqueOrThrow({ where: { id: admin.id } })).active).toBe(true);
  });

  it("never ends with zero admins when two admins deactivate each other at once", async () => {
    const other = await makeUser("ADMIN");
    const { auth } = await import("@/auth");
    // Each call reads the session once (getCurrentUser is cached per request in production).
    vi.mocked(auth as unknown as () => Promise<unknown>)
      .mockResolvedValueOnce({ user: { id: admin.id } })
      .mockResolvedValueOnce({ user: { id: other.id } });
    const results = await Promise.all([setUserActive(other.id, false), setUserActive(admin.id, false)]);
    expect(await testDb.user.count({ where: { role: "ADMIN", active: true } })).toBe(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("resets a password", async () => {
    const staff = await makeUser("STAFF");
    expect(await resetUserPassword(staff.id, { password: "new-password-1" })).toEqual({ ok: true, data: null });
    const u = await testDb.user.findUniqueOrThrow({ where: { id: staff.id } });
    expect(await bcrypt.compare("new-password-1", u.passwordHash)).toBe(true);
  });

  it("treats a deactivated user as signed out on their next request", async () => {
    const staff = await makeUser("STAFF");
    signInAs(staff);
    expect(await getCurrentUser()).toMatchObject({ id: staff.id });
    await testDb.user.update({ where: { id: staff.id }, data: { active: false } });
    expect(await getCurrentUser()).toBeNull();
  });
});
