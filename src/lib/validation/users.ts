import { z } from "zod";
import { email, id, password, requiredText } from "./common";

const base = {
  name: requiredText(100),
  email,
  role: z.enum(["ADMIN", "MANAGER", "STAFF", "TECHNICIAN", "ACCOUNTANT", "VIEWER"], { message: "validation.required" }),
  warehouseIds: z.array(id).max(100),
};

export const createUserSchema = z.object({ ...base, password });
export const updateUserSchema = z.object(base);
export const resetPasswordSchema = z.object({ password });

export type CreateUserFormValues = z.input<typeof createUserSchema>;
export type CreateUserInput = z.output<typeof createUserSchema>;
export type UpdateUserFormValues = z.input<typeof updateUserSchema>;
export type UpdateUserInput = z.output<typeof updateUserSchema>;

/** Client form: same fields for create and edit; the password is only checked when creating. */
export function userFormSchema(isNew: boolean) {
  return z.object({ ...base, password: isNew ? password : z.string() });
}
export type UserFormValues = z.input<ReturnType<typeof userFormSchema>>;

/** A user changing his own password (/account/password). */
export const changePasswordSchema = z
  .object({ current: z.string().min(1, "validation.required").max(200), password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "account.errors.mismatch" })
  .refine((v) => v.password !== v.current, { path: ["password"], message: "account.errors.sameAsOld" });
export type ChangePasswordValues = z.input<typeof changePasswordSchema>;
