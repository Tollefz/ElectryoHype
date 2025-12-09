import { Users } from "lucide-react";

export default function AdminCustomers() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="text-orange-500" />
        <div>
          <h1 className="text-3xl font-bold">Kunder</h1>
          <p className="text-slate-600">Hold oversikt over kundene dine.</p>
        </div>
      </div>
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <p className="text-slate-500">
          Kundelisten er ikke implementert ennå. Her vil du straks få filtrering, søk og kundeprofiler.
        </p>
      </div>
    </div>
  );
}

