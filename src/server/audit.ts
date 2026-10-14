/**
 * Audit log: who changed products, users, warehouses, settings and approvals. Call `audit()` with the
 * SAME transaction client as the change, so a rolled-back change leaves no audit row. Only changed fields
 * are stored (`changedFields`). Never pass password hashes or photo data.
 */
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Tx } from "@/server/stock/createEntry";

export type AuditSubject = "product" | "user" | "warehouse" | "setting" | "approval" | "supplier" | "entry";

export type AuditInput = {
  action: string;
  subjectType: AuditSubject;
  subjectId?: string | null;
  subjectLabel?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export async function audit(client: PrismaClient | Tx, actorId: string, input: AuditInput): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      subjectLabel: input.subjectLabel?.slice(0, 200) ?? null,
      before: input.before ? (jsonable(input.before) as Prisma.InputJsonValue) : Prisma.DbNull,
      after: input.after ? (jsonable(input.after) as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
}

/** Decimal → "12.50", Date → ISO string, nested arrays/objects kept. */
export function jsonable(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toFixed(2);
  if (Array.isArray(value)) return value.map(jsonable);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, jsonable(v)]));
  }
  return String(value);
}

/**
 * The fields of `after` whose value differs from `before` (compared as JSON), as { before, after } —
 * or null when nothing changed. Only keys present in `after` are compared.
 */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const was = jsonable(before[key]);
    const now = jsonable(after[key]);
    if (JSON.stringify(was) !== JSON.stringify(now)) {
      b[key] = was;
      a[key] = now;
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}
