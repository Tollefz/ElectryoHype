import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";
import { GlobalAIAssistantWrapper } from "@/components/admin/GlobalAIAssistantWrapper";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();

  if (!session) {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <GlobalAIAssistantWrapper />
    </div>
  );
}

