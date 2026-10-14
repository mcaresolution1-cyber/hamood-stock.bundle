"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { clientIp, finishLogin, startLogin } from "@/server/auth/login-limits";
import { db } from "@/lib/db";
import { changePasswordSchema } from "@/lib/validation/users";
import { requireUser } from "@/server/auth/dal";
import { guarded, UserFacingError, type ActionResult } from "./result";

/**
 * A user changes his own password. Every other session of this user ends (passwordChangedAt); this one
 * is signed in again with the new password so the user stays where he is.
 */
export async function changeOwnPassword(values: unknown): Promise<ActionResult> {
  return guarded(async () => {
    const me = await requireUser({ allowPasswordChange: true });
    const { current, password } = changePasswordSchema.parse(values);
    const user = await db.user.findUniqueOrThrow({ where: { id: me.id }, select: { email: true, passwordHash: true } });
    // Guessing the current password counts against the same sign-in limits as the login page.
    const attempt = await startLogin(db, user.email, clientIp(await headers()));
    if (attempt.blocked) throw new UserFacingError("auth.errors.rateLimited");
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      await finishLogin(db, attempt.id, { userId: me.id, success: false, reason: "password" });
      throw new UserFacingError("account.errors.wrongCurrent");
    }
    await finishLogin(db, attempt.id, { userId: me.id, success: true });
    await db.user.update({
      where: { id: me.id },
      data: { passwordHash: await bcrypt.hash(password, 12), passwordChangedAt: new Date(), mustChangePassword: false },
    });
    try {
      await signIn("credentials", { email: user.email, password, redirect: false });
    } catch (e) {
      // The password IS changed; if signing in again fails (e.g. limits), sign in by hand.
      // Auth.js errors carry a `type` (e.g. "CredentialsSignin"); checked by shape so this file
      // doesn't load next-auth's runtime.
      if ((e as { type?: unknown })?.type) redirect("/login");
      throw e;
    }
    return null;
  });
}
