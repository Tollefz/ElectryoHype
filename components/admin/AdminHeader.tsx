import { getAuthSession } from "@/lib/auth";

export default async function AdminHeader() {
  const session = await getAuthSession();

  return (
    <header className="border-b bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Administrasjonspanel</h2>
        <div className="text-sm text-slate-600">{session?.user?.email}</div>
      </div>
    </header>
  );
}

