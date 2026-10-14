/**
 * Sign-in limits and history (v2 Phase A). Every attempt is stored in `LoginEvent` (MariaDB, so the
 * limit holds across Hostinger restarts and processes). Too many failed attempts for one email or from
 * one IP address in 15 minutes block further tries until the window has passed. A successful sign-in
 * for an email starts its count again.
 */
import type { PrismaClient } from "@/generated/prisma/client";

export const LOGIN_WINDOW_MS = 15 * 60_000;
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_IP = 30;

export type LoginFailure = "password" | "inactive" | "rateLimited";

/**
 * The client address as seen by Hostinger's proxy: the LAST X-Forwarded-For entry (the one the proxy
 * appended — earlier entries come from the client and can be anything), else X-Real-IP.
 */
export function clientIp(headers: Headers | undefined | null): string | null {
  const forwarded = headers?.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  const ip = forwarded || headers?.get("x-real-ip")?.trim() || null;
  return ip ? ip.slice(0, 64) : null;
}

/**
 * Too many failed (or still running) attempts? `excludeId` = the caller's own "pending" row, so
 * attempts sent at the same moment count each other (see startLogin).
 */
export async function isLoginBlocked(
  client: PrismaClient,
  email: string,
  ip: string | null,
  now = new Date(),
  excludeId?: string,
): Promise<boolean> {
  const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const lastSuccess = await client.loginEvent.findFirst({
    where: { email, success: true, at: { gte: windowStart } },
    orderBy: { at: "desc" },
    select: { at: true },
  });
  const since = lastSuccess && lastSuccess.at > windowStart ? lastSuccess.at : windowStart;
  // Blocked attempts are not counted, so the block ends 15 minutes after the last real failure.
  // "pending" rows are attempts still checking their password — they count too.
  const failed = { success: false, reason: { not: "rateLimited" }, ...(excludeId ? { id: { not: excludeId } } : {}) } as const;
  const [byEmail, byIp] = await Promise.all([
    client.loginEvent.count({ where: { ...failed, email, at: { gt: since } } }),
    ip ? client.loginEvent.count({ where: { ...failed, ip, at: { gte: windowStart } } }) : Promise.resolve(0),
  ]);
  return byEmail >= MAX_FAILURES_PER_EMAIL || byIp >= MAX_FAILURES_PER_IP;
}

/**
 * Record the attempt BEFORE checking the password (reason "pending"), then decide whether it is
 * blocked, counting the other attempts already recorded — so many attempts sent at once can't all
 * slip past the limit. Returns the row id to finish with finishLogin.
 */
export async function startLogin(client: PrismaClient, email: string, ip: string | null) {
  const row = await client.loginEvent.create({
    data: { email: email.slice(0, 200), ip, success: false, reason: "pending" },
    select: { id: true },
  });
  const blocked = await isLoginBlocked(client, email, ip, new Date(), row.id);
  if (blocked) await client.loginEvent.update({ where: { id: row.id }, data: { reason: "rateLimited" } });
  return { id: row.id, blocked };
}

export async function finishLogin(
  client: PrismaClient,
  id: string,
  result: { userId?: string | null; success: boolean; reason?: LoginFailure | null },
) {
  await client.loginEvent.update({
    where: { id },
    data: { userId: result.userId ?? null, success: result.success, reason: result.success ? null : (result.reason ?? "password") },
  });
  if (result.success && result.userId) {
    await client.user.update({ where: { id: result.userId }, data: { lastLoginAt: new Date() } });
  }
}

export async function recordLogin(
  client: PrismaClient,
  event: { email: string; ip: string | null; userId?: string | null; success: boolean; reason?: LoginFailure | null },
) {
  await client.loginEvent.create({
    data: {
      email: event.email.slice(0, 200),
      ip: event.ip,
      userId: event.userId ?? null,
      success: event.success,
      reason: event.reason ?? null,
    },
  });
  if (event.success && event.userId) {
    await client.user.update({ where: { id: event.userId }, data: { lastLoginAt: new Date() } });
  }
}
