/**
 * Approval request reads. Who sees what:
 *   ADMIN      every request
 *   MANAGER    requests in his warehouses (all of the warehouses a request touches) + his own
 *   others     only their own requests
 * The request value (SAR) is only returned to roles with cost:view.
 */
import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/dal";
import { parsePage } from "./entries";

export const REQUEST_PAGE_SIZE = 50;
export const REQUEST_VIEWS = ["toDecide", "mine", "decided"] as const;
export type RequestView = (typeof REQUEST_VIEWS)[number];

/** Requests this user could decide (pending or not): everything for ADMIN, his warehouses for a MANAGER. */
function decideScope(user: CurrentUser): Prisma.ApprovalRequestWhereInput | null {
  if (!can(user.role, "approval:decide")) return null;
  if (user.role === "ADMIN") return {};
  return {
    warehouseId: { in: user.warehouseIds },
    OR: [{ otherWarehouseId: null }, { otherWarehouseId: { in: user.warehouseIds } }],
  };
}

/** May this user open the approvals page at all? (approvers, and anyone who can make a request) */
export function canUseApprovals(user: CurrentUser): boolean {
  return can(user.role, "approval:decide") || can(user.role, "entry:correct") || can(user.role, "entry:void");
}

export function defaultView(user: CurrentUser): RequestView {
  return can(user.role, "approval:decide") ? "toDecide" : "mine";
}

export function parseView(user: CurrentUser, value: unknown): RequestView {
  const v = (REQUEST_VIEWS as readonly string[]).includes(String(value)) ? (value as RequestView) : defaultView(user);
  return v !== "mine" && !can(user.role, "approval:decide") ? "mine" : v;
}

function viewWhere(user: CurrentUser, view: RequestView): Prisma.ApprovalRequestWhereInput {
  const scope = decideScope(user);
  switch (view) {
    case "mine":
      return { requestedById: user.id };
    case "toDecide":
      return scope ? { AND: [scope, { status: "PENDING", requestedById: { not: user.id } }] } : { id: "-" };
    case "decided":
      return scope ? { AND: [scope, { status: { not: "PENDING" } }] } : { id: "-" };
  }
}

export async function listRequests(user: CurrentUser, view: RequestView, pageValue: unknown) {
  const page = parsePage(pageValue);
  const where = viewWhere(user, view);
  const [total, rows] = await Promise.all([
    db.approvalRequest.count({ where }),
    db.approvalRequest.findMany({
      where,
      orderBy: view === "toDecide" ? { requestedAt: "asc" } : { requestedAt: "desc" },
      skip: (page - 1) * REQUEST_PAGE_SIZE,
      take: REQUEST_PAGE_SIZE,
      select: {
        id: true,
        number: true,
        kind: true,
        rule: true,
        status: true,
        units: true,
        requestedAt: true,
        decidedAt: true,
        warehouse: { select: { name: true } },
        otherWarehouse: { select: { name: true } },
        requestedBy: { select: { name: true } },
        decidedBy: { select: { name: true } },
      },
    }),
  ]);
  return { total, page, pageCount: Math.max(1, Math.ceil(total / REQUEST_PAGE_SIZE)), rows };
}

/** Counts for the dashboard and the tab labels. */
export async function requestCounts(user: CurrentUser) {
  const scope = decideScope(user);
  const [toDecide, minePending] = await Promise.all([
    scope ? db.approvalRequest.count({ where: viewWhere(user, "toDecide") }) : Promise.resolve(0),
    db.approvalRequest.count({ where: { requestedById: user.id, status: "PENDING" } }),
  ]);
  return { toDecide, minePending };
}

type StoredLine = { productId: string; quantity: number };

/** One request with its lines, or null when it doesn't exist or this user may not see it. */
export async function getRequest(user: CurrentUser, id: string) {
  const request = await db.approvalRequest.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      kind: true,
      rule: true,
      status: true,
      payload: true,
      units: true,
      value: true,
      requestedAt: true,
      decidedAt: true,
      decisionNote: true,
      requestedById: true,
      warehouseId: true,
      otherWarehouseId: true,
      warehouse: { select: { name: true } },
      otherWarehouse: { select: { name: true } },
      requestedBy: { select: { name: true } },
      decidedBy: { select: { id: true, name: true } },
      resultEntry: { select: { id: true, number: true } },
      targetEntry: { select: { id: true, number: true, type: true, reason: true, voidedAt: true, lines: { select: { productId: true, quantity: true } } } },
    },
  });
  if (!request) return null;
  const scope = decideScope(user);
  const visible =
    request.requestedById === user.id ||
    (scope !== null &&
      (user.role === "ADMIN" ||
        (user.warehouseIds.includes(request.warehouseId) &&
          (!request.otherWarehouseId || user.warehouseIds.includes(request.otherWarehouseId)))));
  if (!visible) return null;

  const payload = request.payload as { lines?: StoredLine[]; direction?: "IN" | "OUT"; reason?: string; note?: string | null };
  const lines: StoredLine[] = request.kind === "ENTRY" ? (payload.lines ?? []) : (request.targetEntry?.lines ?? []);
  const products = await db.product.findMany({
    where: { id: { in: lines.map((l) => l.productId) } },
    select: { id: true, modelCode: true, nameEn: true, nameAr: true, variant: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const { targetEntry } = request;
  return {
    id: request.id,
    number: request.number,
    kind: request.kind,
    rule: request.rule,
    status: request.status,
    units: request.units,
    requestedAt: request.requestedAt,
    decidedAt: request.decidedAt,
    decisionNote: request.decisionNote,
    requestedById: request.requestedById,
    warehouseId: request.warehouseId,
    otherWarehouseId: request.otherWarehouseId,
    warehouse: request.warehouse,
    otherWarehouse: request.otherWarehouse,
    requestedBy: request.requestedBy,
    decidedBy: request.decidedBy,
    resultEntry: request.resultEntry,
    value: can(user.role, "cost:view") && request.value ? request.value.toFixed(2) : null,
    direction: request.kind === "ENTRY" ? (payload.direction ?? null) : null,
    /** ENTRY: the entry's reason. VOID: the reason of the entry being voided. */
    entryReason: request.kind === "ENTRY" ? (payload.reason ?? null) : (targetEntry?.reason ?? null),
    /** ENTRY: the entry note. VOID: why it should be voided. */
    note: request.kind === "ENTRY" ? (payload.note ?? null) : ((request.payload as { reason?: string }).reason ?? null),
    targetEntry: targetEntry ? { id: targetEntry.id, number: targetEntry.number, type: targetEntry.type, voided: Boolean(targetEntry.voidedAt) } : null,
    lines: lines.map((l) => ({ quantity: l.quantity, product: byId.get(l.productId) ?? null, productId: l.productId })),
  };
}

export type RequestDetail = NonNullable<Awaited<ReturnType<typeof getRequest>>>;
