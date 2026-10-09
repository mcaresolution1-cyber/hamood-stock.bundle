import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validation/auth";

// Compared against when the email doesn't exist, so response time doesn't reveal valid emails.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5x8sD3H9xN4ZXrNdfXr8Q8o1d0Vx0qK";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  logger: {
    // A wrong password is a normal event, not a server error — keep the logs clean.
    error(error) {
      // Check `type`, not `name`: class names are minified in production builds.
      if ((error as { type?: string }).type === "CredentialsSignin") return;
      console.error(error);
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await db.user.findUnique({ where: { email } });
        const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !ok || !user.active) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
});
