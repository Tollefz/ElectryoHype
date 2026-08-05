import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";
import { GlobalAIAssistantWrapper } from "@/components/admin/GlobalAIAssistantWrapper";
import { AdminSafeShell } from "@/components/admin/AdminSafeShell";
import { logAdminError } from "@/lib/admin/admin-logger";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  let session: Awaited<ReturnType<typeof getAuthSession>> = null;
  try {
    session = await getAuthSession();
  } catch (error: unknown) {
    logAdminError(error, { route: "/admin", label: "admin-layout:auth" });
    // Soft fail — send to login without throwing to overlay
    redirect("/admin/login");
  }

  if (!session?.user) {
    redirect("/admin/login");
  }

  const role = (session.user as { role?: string }).role;
  if (role !== "admin") {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <AdminSafeShell>{children}</AdminSafeShell>
        </main>
      </div>
      <GlobalAIAssistantWrapper />
    </div>
  );
}
