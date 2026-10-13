"use server";

import bcrypt from "bcryptjs";
import { signIn } from "@/auth";
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
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      throw new UserFacingError("account.errors.wrongCurrent");
    }
    await db.user.update({
      where: { id: me.id },
      data: { passwordHash: await bcrypt.hash(password, 12), passwordChangedAt: new Date(), mustChangePassword: false },
    });
    await signIn("credentials", { email: user.email, password, redirect: false });
    return null;
  });
}
