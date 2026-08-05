import Link from "next/link";
import { getSupplierEngineHealth } from "@/lib/suppliers/health";
import { prisma } from "@/lib/prisma";
import { SupplierEngineTabs } from "@/components/admin/supplier/SupplierEngineTabs";
import { getWorkerObservability } from "@/lib/suppliers/workers/jobs";
import { safeQueryResult } from "@/lib/safeQuery";
import { DataState } from "@/components/admin/DataState";
import { SystemStatusPanel } from "@/components/admin/SystemStatusPanel";
import { runAdminPage } from "@/lib/admin/run-admin-page";

export const dynamic = "force-dynamic";

export default async function SupplierHealthPage() {
  return runAdminPage("suppliers", "/admin/suppliers/health", () => renderHealth());
}

async function renderHealth() {
  const healthRes = await safeQueryResult(
    () => getSupplierEngineHealth(),
    "suppliers:health"
  );
  if (!healthRes.ok) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leverandørstatus</h1>
          <p className="mt-1 text-sm text-slate-600">
            Oversikt over leverandør-motoren.
          </p>
        </div>
        <SupplierEngineTabs />
        <SystemStatusPanel />
        <DataState state="error" surface="suppliers" error={healthRes.error} />
      </div>
    );
  }

  const health = healthRes.data;
  const workersRes = await safeQueryResult(
    () => getWorkerObservability(),
    "suppliers:workers"
  );
  const workers = workersRes.ok ? workersRes.data : health.workers;
  const recentRes = await safeQueryResult(
    () =>
      prisma.supplierChangeEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    "suppliers:changes"
  );
  const recentChanges = recentRes.ok ? recentRes.data : [];

  const clickTiles = [
    {
      label: "Produkter",
      value: health.totals.products,
      href: "/admin/products",
      hint: "Se produktliste",
    },
    {
      label: "Publisert",
      value: health.totals.published,
      href: "/admin/products?filter=active",
      hint: "Aktive produkter",
    },
    {
      label: "På lager",
      value: health.totals.inStock,
      href: "/admin/products?filter=active",
      hint: "Aktive med lager",
    },
    {
      label: "I kø",
      value: health.totals.queued,
      href: "/admin/suppliers/import-queue?status=queued",
      hint: "Åpne kø",
    },
    {
      label: "Review",
      value: health.totals.review,
      href: "/admin/suppliers/import-queue?status=review",
      hint: "Review-liste",
    },
    {
      label: "Feilet",
      value: health.totals.failed,
      href: "/admin/suppliers/import-queue?status=failed",
      hint: "Feilede imports",
    },
    {
      label: "Workers",
      value: workers.activeWorkers,
      href: "/admin/suppliers/workers",
      hint: "Worker-status",
    },
    {
      label: "Åpne endringer",
      value: health.totals.openChanges,
      href: "/admin/suppliers/sync",
      hint: "Synkronisering",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Leverandørstatus</h1>
        <p className="mt-1 text-sm text-slate-600">
          Klikkbart oversiktsbilde — trykk på et tall for å gå direkte til listen.
        </p>
      </div>

      <SupplierEngineTabs />

      <SystemStatusPanel />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {clickTiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t.label}
            </div>
            <div className="mt-1 text-3xl font-bold text-slate-900">{t.value}</div>
            <div className="mt-2 text-xs font-medium text-emerald-700 opacity-0 transition group-hover:opacity-100">
              {t.hint} →
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "API-latency",
            value:
              health.observability.avgApiLatencyMs != null
                ? `${health.observability.avgApiLatencyMs} ms`
                : "Ikke nok data",
          },
          {
            label: "Import-tid",
            value:
              health.observability.avgImportMs != null
                ? `${Math.round(health.observability.avgImportMs / 1000)}s`
                : "Ikke nok data",
          },
          {
            label: "Sync-rate",
            value:
              health.observability.syncRatePerHour > 0
                ? `${health.observability.syncRatePerHour}/t`
                : "Ikke nok data",
          },
          {
            label: "Feilrate 24t",
            value:
              health.observability.errorRate24h != null
                ? `${health.observability.errorRate24h}%`
                : "Ikke nok data",
          },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase text-slate-500">{c.label}</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-3 py-3 text-left">Leverandør</th>
              <th className="px-3 py-3 text-left">API-status</th>
              <th className="px-3 py-3 text-right">Produkter</th>
              <th className="px-3 py-3 text-right">På lager</th>
              <th className="px-3 py-3 text-right">Kø / Review / Feil</th>
              <th className="px-3 py-3 text-left">Siste sync</th>
              <th className="px-3 py-3 text-right">Latency</th>
              <th className="px-3 py-3 text-left">Siste feil</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {health.suppliers.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-3 py-3">
                  <Link
                    href={
                      s.status === "active"
                        ? `/admin/suppliers/${s.id}`
                        : "/admin/suppliers"
                    }
                    className="font-medium text-emerald-700 hover:underline"
                  >
                    {s.displayName}
                  </Link>
                </td>
                <td className="px-3 py-3">
                  {!s.configured ? "Ikke konfigurert" : s.apiOk ? "OK" : "Feil"}
                </td>
                <td className="px-3 py-3 text-right">
                  <Link href="/admin/products" className="hover:underline">
                    {s.publishedCount}/{s.productsCount}
                  </Link>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{s.inStockCount}</td>
                <td className="px-3 py-3 text-right">
                  <Link
                    href="/admin/suppliers/import-queue"
                    className="hover:underline"
                  >
                    {s.queueQueued} / {s.queueReview} / {s.queueFailed}
                  </Link>
                </td>
                <td className="px-3 py-3 text-xs text-slate-600">
                  {s.lastSyncAt
                    ? `${s.lastSyncAt.slice(0, 16).replace("T", " ")}`
                    : "Ikke nok data"}
                </td>
                <td className="px-3 py-3 text-right">
                  {s.avgApiLatencyMs != null
                    ? `${s.avgApiLatencyMs} ms`
                    : "Ikke nok data"}
                </td>
                <td className="max-w-[200px] truncate px-3 py-3 text-xs text-red-700">
                  {s.lastError || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Siste endringer
          </h2>
          <Link
            href="/admin/suppliers/sync"
            className="text-sm font-semibold text-emerald-700 hover:underline"
          >
            Synkronisering →
          </Link>
        </div>
        <ul className="mt-3 divide-y text-sm">
          {recentChanges.length === 0 ? (
            <li className="py-6 text-center text-slate-500">Ingen endringer ennå</li>
          ) : (
            recentChanges.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{c.changeType}</span>
                <span>{c.summary || c.field}</span>
                {c.productId ? (
                  <Link
                    href={`/admin/products/edit/${c.productId}`}
                    className="text-xs font-medium text-emerald-700 hover:underline"
                  >
                    Åpne
                  </Link>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
