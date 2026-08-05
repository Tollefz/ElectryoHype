"use client";

import { useCallback, useEffect, useState } from "react";
import { DataState } from "@/components/admin/DataState";
import {
  classifyAdminError,
  type AdminDataError,
} from "@/lib/admin/data-errors";

type ServiceRow = {
  id: string;
  label: string;
  status: "ok" | "degraded" | "down" | "unknown";
  detail: string;
  latencyMs?: number;
};

type HealthPayload = {
  status: "ok" | "degraded" | "down";
  reason: string;
  latencyMs: number;
  services: ServiceRow[];
  errorsLastHour: number;
  recentErrors: Array<{
    id: string;
    timestamp: string;
    kind: string;
    label?: string;
    message: string;
  }>;
};

const DOT: Record<ServiceRow["status"], string> = {
  ok: "bg-emerald-500",
  degraded: "bg-amber-400",
  down: "bg-red-500",
  unknown: "bg-slate-300",
};

/**
 * Systemstatus panel — same health endpoint as the header indicator.
 */
export function SystemStatusPanel() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<AdminDataError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10_000);
    try {
      const res = await fetch("/api/admin/system-health", {
        signal: ac.signal,
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && !json?.services) {
        throw Object.assign(new Error(json?.message || json?.error || "Feil"), {
          status: res.status,
        });
      }
      setData(json as HealthPayload);
    } catch (e: unknown) {
      const status =
        e && typeof e === "object" && "status" in e
          ? Number((e as { status: unknown }).status)
          : (e as { name?: string })?.name === "AbortError"
            ? 408
            : undefined;
      setError(classifyAdminError(e, status));
      setData(null);
    } finally {
      clearTimeout(t);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return <DataState state="loading" surface="suppliers" compact />;
  }
  if (error && !data) {
    return (
      <DataState
        state={error.kind === "network" ? "offline" : "error"}
        surface="suppliers"
        error={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Systemstatus</h2>
          <p className="mt-0.5 text-sm text-slate-600">{data.reason}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Oppdater
        </button>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(data.services || []).map((s) => (
          <li
            key={s.id}
            className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
          >
            <span
              className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[s.status]}`}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{s.label}</p>
              <p className="text-xs text-slate-600">{s.detail}</p>
              {s.latencyMs != null ? (
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {s.latencyMs} ms
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Feil siste time · {data.errorsLastHour ?? 0}
        </p>
        {(data.recentErrors || []).length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Ingen internfeil logget.</p>
        ) : (
          <ul className="mt-2 max-h-48 space-y-1.5 overflow-auto text-xs text-slate-600">
            {data.recentErrors.map((e) => (
              <li key={e.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                <span className="font-medium text-slate-800">{e.kind}</span>
                {e.label ? ` · ${e.label}` : ""}
                <span className="text-slate-400">
                  {" "}
                  · {e.timestamp.slice(11, 19)}
                </span>
                <div>{e.message}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
