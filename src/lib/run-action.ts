/**
 * Call a server action from the browser without ever crashing the page.
 *
 * On Hostinger a request can fail for reasons that have nothing to do with the user's input: a cold
 * start, the proxy answering with an HTML error page, or a redeploy between page load and submit (the
 * page then calls an action id the new server no longer has). Unwrapped, all of these throw into the
 * error boundary and the user loses the form. Here they become ordinary failed results, so the form
 * stays filled in and shows a toast:
 *   - errors.network     "Connection problem — try again" (optionally retried once first)
 *   - errors.appUpdated  "The app was just updated — reload the page"
 *   - errors.unexpected  server-side bug: shows a reference the logs can be searched for
 *
 * `retry: true` only for actions that are safe to run twice (updates, previews, login, stock entries
 * with an idempotency key). Never for creates/imports, which must not be repeated blindly.
 *
 * Next's own control flow (redirect() / notFound() inside an action) is rethrown untouched, so a
 * signed-out user is still sent to /login. Only retried calls get a timeout: a long write that is never
 * retried (import, opening stock) must not be reported as failed while the server may still commit it,
 * and a timed-out call says "may have been saved — check first", never "nothing was lost".
 */
import type { ActionParams } from "@/server/actions/result";

/** What runAction returns when the call itself failed (not the action's own result). */
export type ActionFailure = { ok: false; error: string; params?: ActionParams; fieldErrors?: Record<string, string> };

export type RunActionOptions = { retry?: boolean; timeoutMs?: number };

const NETWORK = /failed to fetch|networkerror|network error|load failed|network request failed|fetch failed|unexpected response was received|connection/i;
const STALE = /server action.*(not found|was not found)|failed to find server action/i;

export type ActionFailureKind = "network" | "timeout" | "appUpdated" | "unexpected";

/** redirect()/notFound()/forbidden() thrown by Next inside a server action — not an error to report. */
export function isNextControlFlow(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && /^NEXT_(REDIRECT|HTTP_ERROR_FALLBACK|NOT_FOUND)/.test(digest);
}

export function classifyActionError(e: unknown): ActionFailureKind {
  const message = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (STALE.test(message)) return "appUpdated";
  if (e instanceof TimeoutError) return "timeout";
  if (NETWORK.test(message) || (e instanceof TypeError && /fetch/i.test(message))) return "network";
  return "unexpected";
}

class TimeoutError extends Error {
  constructor() {
    super("timeout");
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function runAction<R extends { ok: boolean }>(
  call: () => Promise<R>,
  { retry = false, timeoutMs }: RunActionOptions = {},
): Promise<R | ActionFailure> {
  // Retried (idempotent) calls get a timeout; one-shot writes wait for the server, however long it takes.
  const limit = timeoutMs ?? (retry ? 45_000 : undefined);
  for (let attempt = 1; ; attempt++) {
    try {
      return await (limit ? withTimeout(call(), limit) : call());
    } catch (e) {
      if (isNextControlFlow(e)) throw e; // let Next navigate (e.g. redirect to /login)
      const kind = classifyActionError(e);
      if ((kind === "network" || kind === "timeout") && retry && attempt === 1) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (kind === "timeout") return { ok: false, error: "errors.timeout" };
      if (kind === "network") return { ok: false, error: "errors.network" };
      if (kind === "appUpdated") return { ok: false, error: "errors.appUpdated" };
      // A server-side error: Next gives it a digest that is also in the server log.
      const ref = (e as { digest?: string })?.digest ?? "";
      console.error("[action] unexpected error", ref, e);
      return { ok: false, error: ref ? "errors.unexpectedRef" : "errors.unexpected", params: ref ? { ref } : undefined };
    }
  }
}
