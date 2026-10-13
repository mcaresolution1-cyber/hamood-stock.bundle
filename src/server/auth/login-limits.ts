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

/** First address in X-Forwarded-For (set by Hostinger's proxy), else X-Real-IP. */
export function clientIp(headers: Headers | undefined | null): string | null {
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers?.get("x-real-ip")?.trim() || null;
  return ip ? ip.slice(0, 64) : null;
}

export async function isLoginBlocked(client: PrismaClient, email: string, ip: string | null, now = new Date()): Promise<boolean> {
  const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const lastSuccess = await client.loginEvent.findFirst({
    where: { email, success: true, at: { gte: windowStart } },
    orderBy: { at: "desc" },
    select: { at: true },
  });
  const since = lastSuccess && lastSuccess.at > windowStart ? lastSuccess.at : windowStart;
  // Blocked attempts are not counted, so the block ends 15 minutes after the last real failure.
  const failed = { success: false, reason: { not: "rateLimited" } } as const;
  const [byEmail, byIp] = await Promise.all([
    client.loginEvent.count({ where: { ...failed, email, at: { gt: since } } }),
    ip ? client.loginEvent.count({ where: { ...failed, ip, at: { gte: windowStart } } }) : Promise.resolve(0),
  ]);
  return byEmail >= MAX_FAILURES_PER_EMAIL || byIp >= MAX_FAILURES_PER_IP;
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
