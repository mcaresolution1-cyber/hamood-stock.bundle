"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { canWriteToWarehouse } from "@/lib/permissions";
import { id as idSchema, moneyText } from "@/lib/validation/common";
import { requirePermission } from "@/server/auth/dal";
import { audit } from "@/server/audit";
import { guarded, UserFacingError, type ActionResult } from "./result";

const costsSchema = z.object({
  entryId: idSchema,
  costs: z.array(z.object({ lineId: idSchema, unitCost: moneyText })).min(1).max(100),
});

/**
 * Fill in (or correct) the unit costs of a supplier delivery — "cost pending" (PC3). ADMIN, or a MANAGER of
 * the entry's warehouse. Lines stay untouched; costs live in LineCost. Every change is audited and added to
 * the product's cost history.
 */
export async function setLineCosts(values: unknown): Promise<ActionResult> {
  return guarded(async () => {
    const user = await requirePermission("cost:enter");
    const input = costsSchema.parse(values);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM \`StockEntry\` WHERE id = ${input.entryId} FOR UPDATE`;
      const entry = await tx.stockEntry.findUnique({
        where: { id: input.entryId },
        select: { number: true, reason: true, voidedAt: true, warehouseId: true, lines: { select: { id: true, productId: true, cost: true } } },
      });
      if (!entry) throw new UserFacingError("errors.notFound");
      if (entry.reason !== "SUPPLIER_DELIVERY" || entry.voidedAt) throw new UserFacingError("entries.errors.notCostable");
      if (!canWriteToWarehouse(user, entry.warehouseId)) throw new UserFacingError("stock.errors.warehouseNotAssigned");
      const before: Record<string, string | null> = {};
      const after: Record<string, string | null> = {};
      for (const c of input.costs) {
        const line = entry.lines.find((l) => l.id === c.lineId);
        if (!line) throw new UserFacingError("errors.invalidInput");
        const old = line.cost ? line.cost.unitCost.toFixed(2) : null;
        const next = c.unitCost === null ? null : new Prisma.Decimal(c.unitCost).toFixed(2);
        if (old === next) continue;
        if (next === null) throw new UserFacingError("validation.required"); // a cost, once entered, is corrected, not removed
        await tx.lineCost.upsert({
          where: { lineId: line.id },
          create: { lineId: line.id, unitCost: next, enteredById: user.id },
          update: { unitCost: next, enteredById: user.id, enteredAt: new Date() },
        });
        await tx.productCost.create({ data: { productId: line.productId, cost: next, source: "DELIVERY", changedById: user.id } });
        before[line.id] = old;
        after[line.id] = next;
      }
      if (Object.keys(after).length) {
        await audit(tx, user.id, { action: "entry.costs", subjectType: "entry", subjectId: input.entryId, subjectLabel: entry.number, before, after });
      }
    });
    revalidatePath(`/entries/${input.entryId}`);
    revalidatePath("/entries");
    return null;
  });
}

const creditSchema = z.object({
  entryId: idSchema,
  status: z.enum(["SENT", "CREDIT_RECEIVED"]),
  creditAmount: moneyText.default(""),
});

/** Return to supplier follow-up: mark the credit as received (amount + date), or back to "sent". */
export async function setSupplierReturnCredit(values: unknown): Promise<ActionResult> {
  return guarded(async () => {
    const user = await requirePermission("cost:enter");
    const input = creditSchema.parse(values);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM \`StockEntry\` WHERE id = ${input.entryId} FOR UPDATE`;
      const entry = await tx.stockEntry.findUnique({
        where: { id: input.entryId },
        select: { number: true, reason: true, warehouseId: true, voidedAt: true, supplierReturn: true },
      });
      if (!entry || entry.reason !== "SUPPLIER_RETURN") throw new UserFacingError("errors.notFound");
      if (entry.voidedAt) throw new UserFacingError("entries.errors.voidedEntry");
      if (!canWriteToWarehouse(user, entry.warehouseId)) throw new UserFacingError("stock.errors.warehouseNotAssigned");
      if (input.status === "CREDIT_RECEIVED" && input.creditAmount === null) {
        throw new UserFacingError("errors.invalidInput");
      }
      const data = {
        status: input.status,
        creditAmount: input.status === "CREDIT_RECEIVED" ? input.creditAmount : null,
        creditReceivedAt: input.status === "CREDIT_RECEIVED" ? new Date() : null,
        updatedById: user.id,
      };
      await tx.supplierReturn.upsert({ where: { entryId: input.entryId }, create: { entryId: input.entryId, ...data }, update: data });
      await audit(tx, user.id, {
        action: "entry.supplierCredit",
        subjectType: "entry",
        subjectId: input.entryId,
        subjectLabel: entry.number,
        before: entry.supplierReturn
          ? { status: entry.supplierReturn.status, creditAmount: entry.supplierReturn.creditAmount?.toFixed(2) ?? null }
          : null,
        after: { status: data.status, creditAmount: data.creditAmount },
      });
    });
    revalidatePath(`/entries/${input.entryId}`);
    return null;
  });
}
