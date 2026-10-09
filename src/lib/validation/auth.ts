import { z } from "zod";

/** Messages are next-intl keys under `auth.errors`. */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("emailInvalid")),
  password: z.string().min(1, "passwordRequired"),
});

export type LoginInput = z.infer<typeof loginSchema>;
