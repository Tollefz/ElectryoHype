"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, ShieldCheck, RefreshCw } from "lucide-react";
import { DataState } from "@/components/admin/DataState";
import {
  classifyAdminError,
  type AdminDataError,
} from "@/lib/admin/data-errors";

type Scorecard = {
  engine: string;
  label: string;
  decisions: number;
  approvals: number;
  rejections: number;
  approvalRate: number;
  rejectionRate: number;
  hitRate: number;
  avgConfidence: number | null;
  avgProcessingMs: number | null;
};

type Kpis = {
  productsAnalyzed: number;
  productsImported: number;
  productsPublished: number;
  avgMarginPct: number | null;
  hitRate: number;
  timeSavedHoursEst: number | null;
  improvement30d: number | null;
  decisions30d: number;
  overrides30d: number;
};

type SelfEval = {
  summaryText: string;
  learnings?: string[];
  createdAt: string;
  periodStart: string;
  periodEnd: string;
};

type Override = {
  id: string;
  engine: string;
  field: string;
  subjectKey: string;
  aiValue: string;
  humanValue: string;
  createdAt: string;
  learned: boolean;
};

export default function TrustClient() {
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [selfEval, setSelfEval] = useState<SelfEval | null>(null);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<AdminDataError | null>(null);
  const [loadedOk, setLoadedOk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw Object.assign(new Error("offline"), { status: 0 });
      }
      const res = await fetch("/api/admin/trust?days=30", { signal: ac.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw Object.assign(new Error(data?.error || "Feil"), {
          status: res.status,
        });
      }
      setScorecards(data.scorecards || []);
      setKpis(data.kpis);
      setSelfEval(data.selfEval);
      setOverrides(data.overrides || []);
      setLoadedOk(true);
      setLoadError(null);
    } catch (e: unknown) {
      const status =
        e && typeof e === "object" && "status" in e
          ? Number((e as { status: unknown }).status)
          : (e as { name?: string })?.name === "AbortError"
            ? 408
            : undefined;
      const err = classifyAdminError(e, status);
      setLoadError(err);
      setLoadedOk(false);
      console.error("[trust]", err.logMessage);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSelfEval() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/trust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "self_eval", days: 7 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast.error(classifyAdminError(data?.error || "Feil", res.status).reason);
        return;
      }
      toast.success("Ukentlig evaluering lagret");
      await load();
    } catch (e: unknown) {
      toast.error(classifyAdminError(e).reason);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !loadedOk) {
    return <DataState state="loading" surface="trust" />;
  }

  if (loadError && !loadedOk) {
    return (
      <DataState
        state={loadError.kind === "network" ? "offline" : "error"}
        surface="trust"
        error={loadError}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-slate-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
              AI Trust
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              Målbar AI — transparent og lærende
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Scorecard per motor, menneskelige overstyringer og ukentlig
              self-evaluation. Målet er at AI blir en bedre innkjøper hver måned.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runSelfEval()}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Kjør ukentlig evaluering
          </button>
        </div>

        {kpis && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Tid spart (est.)"
              value={
                kpis.timeSavedHoursEst != null
                  ? `${kpis.timeSavedHoursEst} t`
                  : "Ikke nok data"
              }
            />
            <Kpi
              label="Analysert (30d)"
              value={kpis.productsAnalyzed.toLocaleString("no-NO")}
            />
            <Kpi label="Importert" value={String(kpis.productsImported)} />
            <Kpi label="Publisert" value={String(kpis.productsPublished)} />
            <Kpi
              label="Snittmargin"
              value={kpis.avgMarginPct != null ? `${kpis.avgMarginPct}%` : "—"}
            />
            <Kpi label="AI-treffprosent" value={`${kpis.hitRate}%`} />
            <Kpi
              label="Forbedring 30d"
              value={
                kpis.improvement30d == null
                  ? "—"
                  : `${kpis.improvement30d > 0 ? "+" : ""}${kpis.improvement30d}`
              }
            />
            <Kpi label="Overstyringer" value={String(kpis.overrides30d)} />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-teal-700" />
          <h3 className="font-semibold text-slate-900">AI Scorecard (30 dager)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Motor</th>
                <th className="py-2 pr-3">Beslutninger</th>
                <th className="py-2 pr-3">Godkjent</th>
                <th className="py-2 pr-3">Avvist</th>
                <th className="py-2 pr-3">Treff %</th>
                <th className="py-2 pr-3">Confidence</th>
                <th className="py-2">Tid (ms)</th>
              </tr>
            </thead>
            <tbody>
              {scorecards.map((c) => (
                <tr key={c.engine} className="border-b border-slate-100">
                  <td className="py-2.5 pr-3 font-medium text-slate-900">{c.label}</td>
                  <td className="py-2.5 pr-3">{c.decisions}</td>
                  <td className="py-2.5 pr-3 text-emerald-700">
                    {c.approvals} ({c.approvalRate}%)
                  </td>
                  <td className="py-2.5 pr-3 text-rose-700">
                    {c.rejections} ({c.rejectionRate}%)
                  </td>
                  <td className="py-2.5 pr-3 font-semibold">{c.hitRate}%</td>
                  <td className="py-2.5 pr-3">
                    {c.avgConfidence != null ? `${c.avgConfidence}%` : "—"}
                  </td>
                  <td className="py-2.5">
                    {c.avgProcessingMs != null
                      ? c.avgProcessingMs.toLocaleString("no-NO")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900">Self-evaluation</h3>
          {selfEval?.summaryText ? (
            <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-teal-100 bg-teal-50/40 p-4 font-sans text-sm leading-relaxed text-slate-800">
              {selfEval.summaryText}
            </pre>
          ) : (
            <DataState
              state="empty"
              surface="selfEval"
              compact
              className="mt-2 border-0 bg-transparent"
            />
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900">Human overrides</h3>
          <p className="mt-1 text-xs text-slate-500">
            AI foreslo X — administrator valgte Y. Disse brukes i læring.
          </p>
          {overrides.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Ingen overstyringer logget.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {overrides.map((o) => (
                <li
                  key={o.id}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm"
                >
                  <p className="font-medium text-slate-900">
                    {o.field} · {o.engine}
                    {o.learned ? (
                      <span className="ml-2 text-xs text-teal-700">lært</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-slate-600">
                    AI foreslo: <span className="font-medium">{o.aiValue}</span>
                  </p>
                  <p className="text-slate-600">
                    Administrator valgte:{" "}
                    <span className="font-medium">{o.humanValue}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-teal-100 bg-white/80 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
