/**
 * Sign a test user in for server actions. Each test file must mock the modules first:
 *   vi.mock("@/auth", () => ({ auth: vi.fn() }));
 *   vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
 */
import { vi } from "vitest";
import { auth } from "@/auth";

/** `authAt` = when that session signed in (ms); defaults to now (a fresh sign-in). */
export function signInAs(user: { id: string } | null, authAt: number | undefined = Date.now()) {
  vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue(
    user ? { user: { id: user.id }, authAt, expires: new Date(Date.now() + 3600_000).toISOString() } : null,
  );
}
