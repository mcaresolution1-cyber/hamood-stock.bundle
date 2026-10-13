import { TopBar } from "@/components/top-bar";
import { requireUser } from "@/server/auth/dal";

/**
 * Protected area: every page below requires a valid, active user. The layout lets a user who must change
 * his password through (so the change-password page renders); every other page redirects him itself.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser({ allowPasswordChange: true });

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
