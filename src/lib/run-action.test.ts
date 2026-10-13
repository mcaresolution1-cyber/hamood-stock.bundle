import { describe, expect, it, vi } from "vitest";
import { classifyActionError, runAction } from "./run-action";

describe("runAction", () => {
  it("passes results through", async () => {
    expect(await runAction(async () => ({ ok: true as const, data: 1 }))).toEqual({ ok: true, data: 1 });
    expect(await runAction(async () => ({ ok: false as const, error: "x" }))).toEqual({ ok: false, error: "x" });
  });

  it("turns network failures into a result instead of throwing, retrying once only when allowed", async () => {
    vi.useFakeTimers();
    const failing = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const noRetry = runAction(failing);
    await vi.runAllTimersAsync();
    expect(await noRetry).toEqual({ ok: false, error: "errors.network" });
    expect(failing).toHaveBeenCalledTimes(1);

    const flaky = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ ok: true, data: "saved" });
    const withRetry = runAction(flaky, { retry: true });
    await vi.runAllTimersAsync();
    expect(await withRetry).toEqual({ ok: true, data: "saved" });
    expect(flaky).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("times out only retried calls, and says it may have been saved", async () => {
    vi.useFakeTimers();
    const hanging = runAction(() => new Promise<never>(() => {}), { retry: true, timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await hanging).toEqual({ ok: false, error: "errors.timeout" });

    // A one-shot write (import, opening stock) is never cut off while the server may still commit it.
    let resolve!: (v: { ok: true; data: string }) => void;
    const slow = runAction(() => new Promise<{ ok: true; data: string }>((r) => (resolve = r)));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    resolve({ ok: true, data: "imported" });
    expect(await slow).toEqual({ ok: true, data: "imported" });
    vi.useRealTimers();
  });

  it("lets Next redirects and notFound through untouched", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/login;307;" });
    await expect(runAction(async () => Promise.reject(redirect), { retry: true })).rejects.toBe(redirect);
    const notFound = Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    await expect(runAction(async () => Promise.reject(notFound))).rejects.toBe(notFound);
  });

  it("recognises a redeploy and a server bug", async () => {
    expect(classifyActionError(new Error('Server Action "abc" was not found on the server.'))).toBe("appUpdated");
    expect(classifyActionError(new Error("An unexpected response was received from the server."))).toBe("network");
    const bug = Object.assign(new Error("boom"), { digest: "123456" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runAction(async () => Promise.reject(bug))).toEqual({ ok: false, error: "errors.unexpectedRef", params: { ref: "123456" } });
    spy.mockRestore();
  });
});
