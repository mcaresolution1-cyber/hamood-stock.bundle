import { TopBar } from "@/components/top-bar";
import { Sidebar } from "@/components/app-nav";
import { navItemsFor } from "@/lib/nav";
import { requireUser } from "@/server/auth/dal";

/**
 * Protected area: every page below requires a valid, active user. The layout lets a user who must change
 * his password through (so the change-password page renders); every other page redirects him itself.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser({ allowPasswordChange: true });

  return (
    // Sidebar on the start side from md up (plan ui-menu-import-categories, PU1); phones use the top bar's menu.
    <div className="flex min-h-dvh">
      <Sidebar items={navItemsFor(user.role)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
