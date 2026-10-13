"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { signIn, signOut } from "@/auth";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export type LoginResult = { ok: true } | { ok: false; error: "invalidCredentials" | "rateLimited" | "generic" };

// rules-allow: action-auth — signing in is how a user gets authenticated
export async function loginAction(input: LoginInput): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalidCredentials" };

  try {
    await signIn("credentials", { ...parsed.data, redirect: false });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      if (error instanceof CredentialsSignin && error.code === "rate_limited") return { ok: false, error: "rateLimited" };
      return {
        ok: false,
        error: error.type === "CredentialsSignin" ? "invalidCredentials" : "generic",
      };
    }
    throw error;
  }
}

// rules-allow: action-auth — signing out only clears the caller's own session
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
