/** Audit log reads (ADMIN, ACCOUNTANT). Filters come from the URL; bad values are ignored. */
import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { isValidDay, parsePage, riyadhDayStart } from "./entries";

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_AREAS = ["product", "user", "warehouse", "setting", "approval"] as const;
export type AuditArea = (typeof AUDIT_AREAS)[number];

export type AuditFilters = { area?: AuditArea; userId?: string; from?: string; to?: string; page: number };

export function parseAuditFilters(sp: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const area = one("area");
  return {
    area: (AUDIT_AREAS as readonly string[]).includes(area) ? (area as AuditArea) : undefined,
    userId: one("userId").slice(0, 64) || undefined,
    from: isValidDay(one("from")) ? one("from") : undefined,
    to: isValidDay(one("to")) ? one("to") : undefined,
    page: parsePage(one("page")),
  };
}

export async function listAudit(f: AuditFilters) {
  const at: Prisma.DateTimeFilter = {};
  if (f.from) at.gte = riyadhDayStart(f.from);
  if (f.to) at.lt = new Date(riyadhDayStart(f.to).getTime() + 86_400_000);
  const where: Prisma.AuditLogWhereInput = {
    ...(f.area ? { subjectType: f.area } : {}),
    ...(f.userId ? { actorId: f.userId } : {}),
    ...(at.gte || at.lt ? { at } : {}),
  };
  const [total, rows, users] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      skip: (f.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true,
        at: true,
        action: true,
        subjectType: true,
        subjectId: true,
        subjectLabel: true,
        before: true,
        after: true,
        actor: { select: { name: true } },
      },
    }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { total, page: f.page, pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)), rows, users };
}
