import { Users } from "lucide-react";

export default function AdminCustomers() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-green-100 p-2.5">
          <Users className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Kunder</h1>
          <p className="text-sm text-gray-600">Hold oversikt over kundene dine</p>
        </div>
      </div>
      <div className="rounded-lg bg-white border border-gray-200 p-6 sm:p-8 shadow-sm text-center">
        <Users className="mx-auto mb-4 h-12 w-12 sm:h-16 sm:w-16 text-gray-300" />
        <h2 className="mb-2 text-lg sm:text-xl font-semibold text-gray-900">Kundelisten kommer snart</h2>
        <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto">
          Her vil du straks få filtrering, søk og kundeprofiler for å administrere alle kundene dine.
        </p>
      </div>
    </div>
  );
}

