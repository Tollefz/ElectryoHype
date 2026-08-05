import Link from "next/link";
import { listCatalogSuppliers } from "@/lib/suppliers/registry";
import { getSupplierEngineHealth } from "@/lib/suppliers/health";
import { SupplierEngineTabs } from "@/components/admin/supplier/SupplierEngineTabs";
import { PipelineStepper } from "@/components/admin/supplier/PipelineStepper";
import { StatusBadge } from "@/components/admin/supplier/StatusBadge";
import { DataState } from "@/components/admin/DataState";
import { safeQueryResult } from "@/lib/safeQuery";
import { runAdminPage } from "@/lib/admin/run-admin-page";
import {
  Package,
  ClipboardList,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SuppliersHubPage() {
  return runAdminPage("suppliers", "/admin/suppliers", () => renderSuppliersHub());
}

async function renderSuppliersHub() {
  const suppliers = listCatalogSuppliers({ includeComing: true, includeLegacy: true });
  const healthRes = await safeQueryResult(
    () => getSupplierEngineHealth(),
    "suppliers:hub-health"
  );
  if (!healthRes.ok) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Leverandører
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Kontrollsenter — søk, importer, review og publiser.
          </p>
        </div>
        <SupplierEngineTabs />
        <DataState state="error" surface="suppliers" error={healthRes.error} />
      </div>
    );
  }
  const health = healthRes.data;
  const byId = Object.fromEntries(health.suppliers.map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Leverandører
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Kontrollsenter — søk, importer, review og publiser uten å huske URL-er.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/suppliers/merchandiser"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            AI Merchandiser
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/admin/suppliers/import-queue?status=review"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Gå til review
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      <SupplierEngineTabs />

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Arbeidsflyt
        </h2>
        <PipelineStepper current="search" />
        <p className="mt-3 text-sm text-slate-600">
          Anbefalt: start i{" "}
          <Link href="/admin/suppliers/merchandiser" className="font-semibold text-emerald-700 underline">
            AI Merchandiser
          </Link>{" "}
          → importer til kø → preview → review → publiser. Eller søk manuelt hos en leverandør under.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "I kø",
            value: health.totals.queued,
            href: "/admin/suppliers/import-queue?status=queued",
            icon: ClipboardList,
            tone: "slate",
          },
          {
            label: "Til review",
            value: health.totals.review,
            href: "/admin/suppliers/import-queue?status=review",
            icon: Package,
            tone: "amber",
          },
          {
            label: "Feilet",
            value: health.totals.failed,
            href: "/admin/suppliers/import-queue?status=failed",
            icon: AlertTriangle,
            tone: "red",
          },
          {
            label: "Åpne endringer",
            value: health.totals.openChanges,
            href: "/admin/suppliers/health",
            icon: RefreshCw,
            tone: "indigo",
          },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.label}
              href={c.href}
              className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {c.label}
                </span>
                <Icon size={16} className="text-slate-400 group-hover:text-emerald-600" />
              </div>
              <div className="mt-2 text-3xl font-bold text-slate-900">{c.value}</div>
            </Link>
          );
        })}
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Leverandører
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {suppliers.map((s) => {
            const h = byId[s.id];
            const href =
              s.status === "active" || s.status === "coming" ? s.href : s.href;
            const CardInner = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{s.displayName}</h3>
                    <p className="mt-1 text-sm text-slate-600">{s.description}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>

                {s.status === "active" ? (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Metric
                      label="API"
                      value={
                        !h?.configured
                          ? "Mangler"
                          : h.apiOk
                            ? "OK"
                            : "Feil"
                      }
                      good={Boolean(h?.configured && h.apiOk)}
                    />
                    <Metric
                      label="Produkter"
                      value={String(h?.productsCount ?? 0)}
                    />
                    <Metric
                      label="Draft/review"
                      value={`${h?.queueQueued ?? 0}/${h?.queueReview ?? 0}`}
                    />
                    <Metric
                      label="Feil"
                      value={String(h?.queueFailed ?? 0)}
                      warn={(h?.queueFailed ?? 0) > 0}
                    />
                    <Metric
                      label="Latency"
                      value={
                        h?.avgApiLatencyMs != null ? `${h.avgApiLatencyMs} ms` : "—"
                      }
                    />
                    <Metric
                      label="Siste sync"
                      value={
                        h?.lastSyncAt
                          ? h.lastSyncAt.slice(5, 16).replace("T", " ")
                          : "—"
                      }
                    />
                    <Metric
                      label="Sync"
                      value={h?.lastSyncStatus || "—"}
                    />
                    <Metric
                      label="API-feil 24t"
                      value={String(h?.recentApiErrors ?? 0)}
                      warn={(h?.recentApiErrors ?? 0) > 0}
                    />
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">
                    {s.status === "coming"
                      ? "Ikke aktivert ennå."
                      : "Legacy — kun vedlikehold."}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between text-sm font-semibold text-emerald-700">
                  <span>
                    {s.status === "active"
                      ? "Åpne katalog"
                      : s.status === "legacy"
                        ? "Åpne legacy-import"
                        : "Se status"}
                  </span>
                  <ArrowRight size={16} />
                </div>
              </>
            );

            return s.status === "coming" ? (
              <div
                key={s.id}
                className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-5 opacity-90"
              >
                {CardInner}
              </div>
            ) : (
              <Link
                key={s.id}
                href={href}
                className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
              >
                {CardInner}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  good,
  warn,
}: {
  label: string;
  value: string;
  good?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={`mt-0.5 text-sm font-semibold ${
          good ? "text-emerald-700" : warn ? "text-red-700" : "text-slate-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
