import { z } from "zod";
import { email, id, password, requiredText } from "./common";

const base = {
  name: requiredText(100),
  email,
  role: z.enum(["ADMIN", "STAFF", "VIEWER"], { message: "validation.required" }),
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
