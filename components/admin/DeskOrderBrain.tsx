"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSmartPoll } from "@/lib/admin/useSmartPoll";
import type { OrderBrainDeskStatus } from "@/lib/orders/order-desk-status";
import type { OrderBrainAttentionItem } from "@/lib/orders/order-desk-status";

const LIGHT: Record<
  OrderBrainDeskStatus["status"],
  { label: string; className: string; dot: string }
> = {
  waiting: {
    label: "Venter",
    className: "bg-slate-50 text-slate-800 border-slate-200",
    dot: "bg-slate-400",
  },
  learning: {
    label: "Trenger blikk",
    className: "bg-amber-50 text-amber-950 border-amber-200",
    dot: "bg-amber-500",
  },
  ready: {
    label: "Stabil",
    className: "bg-emerald-50 text-emerald-900 border-emerald-200",
    dot: "bg-emerald-500",
  },
  error: {
    label: "Feil",
    className: "bg-rose-50 text-rose-900 border-rose-200",
    dot: "bg-rose-500",
  },
};

/**
 * Rob's Desk — Order Brain (facts only).
 * No automatic refunds or customer decisions.
 */
export function DeskOrderBrain() {
  const [status, setStatus] = useState<OrderBrainDeskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ticking, setTicking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/orders/automation?view=brain");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && data.status) {
        setStatus(data.status as OrderBrainDeskStatus);
      }
    } catch {
      /* keep */
    } finally {
      setLoading(false);
    }
  }, []);

  useSmartPoll({
    tick: load,
    active:
      status?.status === "learning" || status?.worker?.status === "running",
    activeMs: 15_000,
    idleMs: 45_000,
    enabled: true,
  });

  const light = status ? LIGHT[status.status] : LIGHT.waiting;
  const d = status?.dashboard;

  const runTick = async () => {
    setTicking(true);
    try {
      await fetch("/api/admin/orders/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tick" }),
      });
      await load();
    } finally {
      setTicking(false);
    }
  };

  return (
    <section id="desk-orders" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Order Brain
          </h2>
          <p className="text-sm text-slate-600">
            Jeg forstår ordre-livssyklusen med fakta. Ingen automatiske
            refusjoner. Du bestemmer alltid overfor kunden.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${light.className}`}
          >
            <span className={`h-2 w-2 rounded-full ${light.dot}`} />
            {loading && !status ? "Laster…" : light.label}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            Worker: {status?.worker?.status ?? "—"}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            Memory {status?.memory?.memoryScore ?? 0}/100
          </span>
        </div>
      </div>

      {loading && !status ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Leser ordre…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Metric label="Siste døgn" value={d?.orders24h ?? 0} />
            <Metric label="Behandles" value={d?.processing ?? 0} />
            <Metric label="Sendt" value={d?.shipped ?? 0} />
            <Metric label="Levert 24t" value={d?.delivered24h ?? 0} />
            <Metric label="Forsinket" value={d?.delayed ?? 0} />
            <Metric label="Avvik" value={d?.exceptions ?? 0} />
            <Metric label="Kansellert 7d" value={d?.cancelled7d ?? 0} />
          </div>

          {status?.narrative ? (
            <p className="text-sm text-slate-700">{status.narrative}</p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <AttentionList
              title="Trenger oppmerksomhet"
              items={status?.needsAttention}
              empty="Ingen ordre krever handling akkurat nå."
            />
            <AttentionList
              title="Forsinkede ordre"
              items={status?.delayed}
              empty="Ingen over forsinkelses-terskel."
              tone="warning"
            />
            <AttentionList
              title="Høy risiko"
              items={status?.highRisk}
              empty="Ingen error-faser."
              tone="warning"
            />
            <AttentionList
              title="Tracking-avvik"
              items={status?.trackingGaps}
              empty="Ingen manglende tracking på bestilte ordre."
              tone="warning"
            />
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <h3 className="text-sm font-semibold text-slate-900">
              Leverandørproblemer (Memory)
            </h3>
            {(status?.supplierIssues?.length ?? 0) === 0 ? (
              <p className="mt-1.5 text-xs text-slate-500">
                Ingen negative leverandørmønstre lært ennå.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {status!.supplierIssues.map((s) => (
                  <li key={s.supplier}>
                    <p className="text-sm font-medium text-slate-800">
                      {s.supplier}
                    </p>
                    <p className="text-xs text-slate-600">{s.fact}</p>
                  </li>
                ))}
              </ul>
            )}
            {(status?.memory?.stories?.length ?? 0) > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-slate-200/80 pt-2">
                {status!.memory.stories.slice(0, 4).map((s) => (
                  <li key={s.id} className="text-xs text-slate-700">
                    <span className="font-medium">{s.text}</span>
                    <span className="text-slate-500"> — {s.why}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <details className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
              Order Insights (hvorfor)
            </summary>
            <ul className="mt-2 space-y-2">
              {(status?.insights || []).map((i) => (
                <li
                  key={i.id}
                  className="rounded-lg border border-slate-100 bg-white px-2.5 py-2"
                >
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    {i.question}
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    {i.title}
                  </p>
                  <p className="text-xs text-slate-600">{i.detail}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">
                      Hvorfor:{" "}
                    </span>
                    {i.why}
                  </p>
                </li>
              ))}
            </ul>
          </details>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <p>
              Memory:{" "}
              {status?.memory?.rebuiltAt
                ? new Date(status.memory.rebuiltAt).toLocaleString("nb-NO")
                : "—"}
              {" · "}
              Worker:{" "}
              {status?.worker?.lastTickAt
                ? new Date(status.worker.lastTickAt).toLocaleString("nb-NO")
                : "aldri"}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={runTick}
                disabled={ticking}
                className="font-medium text-slate-700 hover:underline disabled:opacity-50"
              >
                {ticking ? "Ticker…" : "Kjør tick"}
              </button>
              <Link
                href="/admin/orders"
                className="font-medium text-emerald-700 hover:underline"
              >
                Ordre →
              </Link>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function AttentionList({
  title,
  items,
  empty,
  tone = "neutral",
}: {
  title: string;
  items?: OrderBrainAttentionItem[];
  empty: string;
  tone?: "neutral" | "warning";
}) {
  const border =
    tone === "warning"
      ? "border-amber-100 bg-amber-50/40"
      : "border-slate-100 bg-slate-50/60";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${border}`}>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {!items || items.length === 0 ? (
        <p className="mt-1.5 text-xs text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {items.map((o) => (
            <li key={`${title}-${o.orderId}-${o.severity}`}>
              <p className="text-sm font-medium text-slate-800">
                {o.orderNumber}
                <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                  {o.reason}
                </span>
              </p>
              <p className="text-xs text-slate-600">{o.fact}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}
