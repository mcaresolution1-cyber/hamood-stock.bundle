/**
 * Result type + error mapping shared by all server actions. Not a "use server" module itself.
 * Expected failures become `{ ok: false, error: <translation key> }`; redirects and unknown errors
 * propagate (unknown errors are logged and shown as a generic message by Next's error boundary).
 */
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AuthorizationError } from "@/server/auth/dal";
import { EntryRuleError, InsufficientStockError } from "@/server/stock/errors";

export type ActionParams = Record<string, string | number>;

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; params?: ActionParams; fieldErrors?: Record<string, string> };

/** Throw from inside an action for an expected, user-facing failure. */
export class UserFacingError extends Error {
  constructor(
    readonly key: string,
    readonly params: ActionParams = {},
  ) {
    super(key);
    this.name = "UserFacingError";
  }
}

export async function guarded<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    if (e instanceof AuthorizationError) return { ok: false, error: "errors.forbidden" };
    if (e instanceof UserFacingError || e instanceof EntryRuleError) {
      return { ok: false, error: e.key, params: e.params };
    }
    if (e instanceof InsufficientStockError) {
      const d = e.details;
      return {
        ok: false,
        error: "stock.errors.insufficient",
        params: { available: d.available, modelCode: d.modelCode, warehouse: d.warehouseName },
      };
    }
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = issue.message;
      }
      return { ok: false, error: "errors.invalidInput", fieldErrors };
    }
    throw e;
  }
}

/** True for a Prisma unique-constraint violation (P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === "P2002";
}
