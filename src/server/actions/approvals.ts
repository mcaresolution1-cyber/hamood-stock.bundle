"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { id as idSchema } from "@/lib/validation/common";
import { requirePermission, requireUser } from "@/server/auth/dal";
import { cancelRequest, decideRequest, type DecideResult } from "@/server/stock/approvals";
import { guarded, type ActionResult } from "./result";

const decideSchema = z.object({
  requestId: idSchema,
  approve: z.boolean(),
  note: z.string().trim().max(500, "validation.tooLong").optional(),
});

/** Approve (carries out the entry / void) or reject (note required). Scope rules live in decideRequest. */
export async function decideRequestAction(values: unknown): Promise<ActionResult<DecideResult>> {
  return guarded(async () => {
    const user = await requirePermission("approval:decide");
    const input = decideSchema.parse(values);
    const result = await decideRequest(db, user, input);
    revalidateAfterDecision(input.requestId);
    return result;
  });
}

/** The requester withdraws his own pending request. */
export async function cancelRequestAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const user = await requireUser();
    const requestId = idSchema.parse(id);
    await cancelRequest(db, user, requestId);
    revalidateAfterDecision(requestId);
    return null;
  });
}

function revalidateAfterDecision(requestId: string) {
  revalidatePath("/approvals");
  revalidatePath(`/approvals/${requestId}`);
  revalidatePath("/entries");
  revalidatePath("/");
}
