"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { SupplierEngineTabs } from "@/components/admin/supplier/SupplierEngineTabs";
import { presentImportError } from "@/lib/ops/import-failure-reasons";

type RecentJob = {
  id: string;
  type: string;
  status: string;
  progress: number;
  progressMessage: string | null;
  attempts: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  runAfter: string | null;
};

type BuyerLive = {
  id: string;
  missionName: string | null;
  status: string;
  stage: string | null;
  scanned: number;
  kept: number;
  filtered: number;
  target: number;
  productsPerMin: number | null;
  etaMinutes: number | null;
  checkpoint: {
    page: number | null;
    seedIdx: number | null;
    supplierIdx: number | null;
  };
  pendingBatches: number;
  error: string | null;
  updatedAt: string;
};

type WorkerSnapshot = {
  byStatus: Record<string, number>;
  activeWorkers: number;
  deadLast24h: number;
  succeededLast24h: number;
  avgImportMs: number | null;
  queueLength: number;
  recentJobs?: RecentJob[];
  buyer?: BuyerLive | null;
};

export default function WorkersClient({ initial }: { initial: WorkerSnapshot }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      const res = await fetch("/api/admin/suppliers/workers");
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Feil");
      if (json.observability) setData(json.observability as WorkerSnapshot);
    } catch (e: unknown) {
      if (!opts?.silent) {
        toast.error(e instanceof Error ? e.message : "Kunne ikke oppdatere");
      }
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh({ silent: true });
    };
    const t = setInterval(tick, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/suppliers/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency: 3, limit: 10 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Kunne ikke starte workers");
      toast.success(
        `Ferdig: ${json.succeeded ?? 0} OK, ${json.failed ?? 0} feilet, ${json.dead ?? 0} dead`
      );
      await refresh({ silent: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  };

  const buyer = data.buyer;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Importmotor</h1>
          <p className="mt-1 text-sm text-slate-600">
            Status for import, synk og produktkjøper-oppdrag.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
        >
          <RefreshCw size={14} /> Oppdater
        </button>
      </div>

      <SupplierEngineTabs />

      {buyer && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-emerald-950">
            Digital Buyer · live oppdrag
          </h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <Stat label="Oppdrag" value={buyer.missionName || buyer.id.slice(-8)} />
            <Stat label="Status" value={buyer.status} />
            <Stat label="Steg" value={buyer.stage || "—"} />
            <Stat
              label="Analysert"
              value={`${buyer.scanned.toLocaleString("no-NO")} / ${buyer.target.toLocaleString("no-NO")}`}
            />
            <Stat
              label="Produkter/min"
              value={buyer.productsPerMin != null ? String(buyer.productsPerMin) : "—"}
            />
            <Stat
              label="ETA"
              value={
                buyer.etaMinutes != null ? `~${buyer.etaMinutes} min` : "—"
              }
            />
            <Stat
              label="Checkpoint"
              value={`p${buyer.checkpoint.page ?? "—"} · seed ${buyer.checkpoint.seedIdx ?? "—"} · lev ${buyer.checkpoint.supplierIdx ?? "—"}`}
            />
            <Stat label="Pending batches" value={String(buyer.pendingBatches)} />
            <Stat label="Beholdt" value={String(buyer.kept)} />
            <Stat label="Filtrert" value={String(buyer.filtered)} />
            <Stat
              label="Siste aktivitet"
              value={new Date(buyer.updatedAt).toLocaleString("no-NO")}
            />
            <Stat label="Retry / feil" value={buyer.error || "ingen"} />
          </dl>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Aktive nå", value: data.activeWorkers },
          { label: "Jobbkø", value: data.queueLength },
          { label: "OK siste 24t", value: data.succeededLast24h },
          { label: "Feilede jobber (24t)", value: data.deadLast24h },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-xs uppercase text-slate-500">{c.label}</div>
            <div className="mt-1 text-3xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Statusfordeling</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(data.byStatus).length === 0 ? (
            <p className="text-sm text-slate-500">Ingen jobs ennå</p>
          ) : (
            Object.entries(data.byStatus).map(([k, v]) => (
              <span
                key={k}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                {k}: {v}
              </span>
            ))
          )}
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Snitt import-tid:{" "}
          {data.avgImportMs != null ? `${Math.round(data.avgImportMs / 1000)}s` : "—"}
          {" · "}Rate limits håndteres i worker (CJ ~1 QPS)
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          Kjør workers nå
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          Siste aktivitet (jobs)
        </h2>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {(data.recentJobs || []).length === 0 ? (
            <li className="py-2 text-slate-500">Ingen nylige jobs</li>
          ) : (
            (data.recentJobs || []).map((j) => (
              <li key={j.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {j.type} · {j.status}
                  </p>
                  <p className="text-xs text-slate-500">
                    {j.progressMessage || "—"}
                    {j.attempts > 1 ? ` · retry ${j.attempts}` : ""}
                    {j.lastError
                      ? ` · ${presentImportError(j.lastError).title}`
                      : ""}
                  </p>
                </div>
                <span className="text-[11px] text-slate-400">
                  {new Date(j.updatedAt).toLocaleString("no-NO")}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white/80 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
