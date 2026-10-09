/**
 * Sign a test user in for server actions. Each test file must mock the modules first:
 *   vi.mock("@/auth", () => ({ auth: vi.fn() }));
 *   vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
 */
import { vi } from "vitest";
import { auth } from "@/auth";

export function signInAs(user: { id: string } | null) {
  vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue(
    user ? { user: { id: user.id }, expires: new Date(Date.now() + 3600_000).toISOString() } : null,
  );
}
