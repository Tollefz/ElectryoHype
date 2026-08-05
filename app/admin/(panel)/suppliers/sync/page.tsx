import SupplierSyncClient from "./SupplierSyncClient";
import { SupplierEngineTabs } from "@/components/admin/supplier/SupplierEngineTabs";

export default function SupplierSyncPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Synkronisering</h1>
        <p className="mt-1 text-sm text-slate-600">
          Oppdater lager og leverandørpris. Salgspris overskrives ikke automatisk.
        </p>
      </div>
      <SupplierEngineTabs />
      <SupplierSyncClient />
    </div>
  );
}
