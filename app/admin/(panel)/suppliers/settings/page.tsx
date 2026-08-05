import Link from "next/link";
import { listEnabledSupplierAccounts } from "@/lib/suppliers/accounts";
import { DEFAULT_SYNC_POLICY_VIEW } from "@/lib/suppliers/sync/policy";
import { SupplierEngineTabs } from "@/components/admin/supplier/SupplierEngineTabs";

export const dynamic = "force-dynamic";

export default async function SupplierSettingsPage() {
  const accounts = await listEnabledSupplierAccounts().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Innstillinger</h1>
        <p className="mt-1 text-sm text-slate-600">
          Leverandørkontoer og sync-policy. Hemmeligheter lagres ikke her — kun referanser.
        </p>
      </div>

      <SupplierEngineTabs />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Standard sync-policy
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(DEFAULT_SYNC_POLICY_VIEW).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 px-3 py-2">
              <div className="text-xs font-semibold uppercase text-slate-500">{k}</div>
              <div className="text-sm font-medium text-slate-900">{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Aktive kontoer
        </h2>
        {accounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            Ingen kontoer ennå. De opprettes automatisk ved første import.
          </div>
        ) : (
          accounts.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {a.supplierType} · {a.accountName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Credentials: {a.apiCredentialsReference || "—"} · Valuta{" "}
                    {a.defaultCurrency}
                  </p>
                </div>
                <Link
                  href={`/admin/suppliers/${a.supplierType === "onesixeight" ? "onesixeight" : a.supplierType}`}
                  className="text-sm font-semibold text-emerald-700 hover:underline"
                >
                  Åpne katalog
                </Link>
              </div>
              {a.syncPolicy ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">
                    stock: {a.syncPolicy.stock}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">
                    supplierPrice: {a.syncPolicy.supplierPrice}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">
                    retail: {a.syncPolicy.retailPrice}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">
                    seo: {a.syncPolicy.seo}
                  </span>
                </div>
              ) : null}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
