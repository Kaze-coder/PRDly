import { DashboardSidebar } from '@/components/shared/DashboardSidebar';
import { DashboardHeader } from '@/components/shared/DashboardHeader';
import { getAuthUserOrRedirect } from '@/lib/auth/get-auth-user';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUserOrRedirect();

  return (
    <div className="flex h-screen overflow-hidden">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader email={user.email} avatarUrl={user.avatarUrl} />
        <main className="relative flex-1 overflow-y-auto bg-paper p-4 sm:p-6">
          {/* Document texture — token-driven grid, adapts to dark mode */}
          <div className="bg-paper-grid mask-fade pointer-events-none absolute inset-0 opacity-[0.35]" />
          <div className="relative h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
