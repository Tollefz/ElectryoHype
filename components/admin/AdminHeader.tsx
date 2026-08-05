import { getAuthSession } from "@/lib/auth";
import { AdminSystemStatus } from "@/components/admin/AdminSystemStatus";
import { logAdminError } from "@/lib/admin/admin-logger";

export default async function AdminHeader() {
  let email = "";
  try {
    const session = await getAuthSession();
    email = session?.user?.email || "";
  } catch (error: unknown) {
    logAdminError(error, { route: "/admin", label: "AdminHeader:auth" });
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
            Administrasjon
          </h2>
          <p className="hidden text-xs text-slate-500 sm:block">
            Daglig drift via Rob’s Desk · under 20 min
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <AdminSystemStatus />
          {email ? (
            <div className="truncate rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {email}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
