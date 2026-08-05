"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useSmartPoll } from "@/lib/admin/useSmartPoll";
import type { FinanceDeskStatus } from "@/lib/finance/finance-desk-status";
import type { FinanceProductRow } from "@/lib/finance/finance-dashboard";
import type { FinanceInsight } from "@/lib/finance/finance-insights";
import type { FinancePeriodKey } from "@/lib/finance/finance-periods";

const LIGHT: Record<
  FinanceDeskStatus["status"],
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

const PERIOD_DAYS: Record<FinancePeriodKey, number> = {
  today: 1,
  week: 7,
  month: 30,
};

/**
 * Rob's Desk — Finance Brain (butikkens økonomisjef).
 * Recommendations only — never auto-prices.
 */
export function DeskFinanceBrain() {
  const [period, setPeriod] = useState<FinancePeriodKey>("month");
  const [status, setStatus] = useState<FinanceDeskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ticking, setTicking] = useState(false);

  const load = useCallback(async () => {
    try {
      const days = PERIOD_DAYS[period];
      const res = await fetch(
        `/api/admin/finance?view=desk_status&days=${days}`
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && data.status) {
        setStatus(data.status as FinanceDeskStatus);
      }
    } catch {
      /* keep */
    } finally {
      setLoading(false);
    }
  }, [period]);

  // Refetch when period changes (useSmartPoll only polls on interval/focus).
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useSmartPoll({
    tick: load,
    active: status?.status === "learning",
    activeMs: 30_000,
    idleMs: 90_000,
    enabled: true,
  });

  const light = status ? LIGHT[status.status] : LIGHT.waiting;
  const d = status?.dashboard;
  const periods = status?.periods || [];

  const runTick = async () => {
    setTicking(true);
    try {
      await fetch("/api/admin/finance", {
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
    <section
      id="desk-finance"
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Finance Brain · Økonomisjef
          </h2>
          <p className="text-sm text-slate-600">
            Margin, fortjeneste, ROI, ROAS, CPA, CAC, valuta og frakt. Kun
            anbefaling — jeg endrer aldri priser.
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
            Memory {status?.memory?.memoryScore ?? 0}/100
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "today" as const, label: "I dag" },
            { key: "week" as const, label: "Uke" },
            { key: "month" as const, label: "Måned" },
          ] as const
        ).map((p) => {
          const summary = periods.find((x) => x.key === p.key);
          const active = period === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                active
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
              }`}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-70">
                {p.label}
              </span>
              <span className="font-semibold tabular-nums">
                {summary
                  ? `${Math.round(summary.grossProfit)} kr`
                  : "…"}
              </span>
              <span className="mt-0.5 block text-[11px] opacity-80">
                {summary
                  ? `${summary.paidOrders} ordre · ${Math.round(summary.revenue)} kr`
                  : "Laster resultat"}
              </span>
            </button>
          );
        })}
      </div>

      {loading && !status ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Leser økonomi…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Metric
              label="Bruttofortjeneste"
              value={`${Math.round(d?.grossProfit ?? 0)} kr`}
            />
            <Metric
              label="Netto (est.)"
              value={`${Math.round(d?.netProfit ?? 0)} kr`}
            />
            <Metric
              label="ROI"
              value={d?.roi != null ? `${d.roi} %` : "—"}
            />
            <Metric
              label="ROAS"
              value={d?.roas != null ? `${d.roas}x` : "—"}
            />
            <Metric
              label="CPA"
              value={d?.cpa != null ? `${Math.round(d.cpa)} kr` : "—"}
            />
            <Metric
              label="CAC"
              value={d?.cac != null ? `${Math.round(d.cac)} kr` : "—"}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric
              label="Omsetning"
              value={`${Math.round(d?.revenue ?? 0)} kr`}
            />
            <Metric
              label="Leverandørkost"
              value={`${Math.round(d?.supplierCost ?? 0)} kr`}
            />
            <Metric
              label="Frakt innkrevd"
              value={`${Math.round(d?.shippingCollected ?? 0)} kr`}
            />
            <Metric
              label="USD/NOK"
              value={d?.fxUsdNok ? String(d.fxUsdNok) : "—"}
            />
          </div>

          {status?.narrative ? (
            <p className="text-sm text-slate-700">{status.narrative}</p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <ProductList
              title="Beste produkter"
              items={d?.profitable}
              empty="Ingen solgte med positiv fortjeneste ennå."
              tone="positive"
            />
            <ProductList
              title="Verste produkter"
              items={d?.lossMaking}
              empty="Ingen tap eller kritisk lav margin i snapshot."
              tone="warning"
            />
            <ProductList
              title="Høyeste margin"
              items={d?.highestMargin}
              empty="Mangler supplierPrice."
              tone="positive"
            />
            <ProductList
              title="Laveste margin"
              items={d?.lowestMargin}
              empty="Mangler supplierPrice."
              tone="warning"
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">
              AI Insights
            </h3>
            <ul className="space-y-2">
              {(status?.insights || []).slice(0, 8).map((i) => (
                <InsightCard key={i.id} insight={i} />
              ))}
            </ul>
          </div>

          {status?.recommendations?.[0] ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-sm text-emerald-950">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/80">
                Anbefaling · du må godkjenne · ingen auto-pris
              </p>
              <p className="mt-0.5 font-semibold">
                {status.recommendations[0].title}
              </p>
              <p className="mt-1 text-xs text-emerald-900/85">
                {status.recommendations[0].rationale}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <p>
              Periode:{" "}
              {period === "today"
                ? "i dag"
                : period === "week"
                  ? "7 dager"
                  : "30 dager"}{" "}
              · Worker:{" "}
              {status?.lastWorkerTickAt
                ? new Date(status.lastWorkerTickAt).toLocaleString("nb-NO")
                : "aldri"}
            </p>
            <button
              type="button"
              onClick={runTick}
              disabled={ticking}
              className="font-medium text-slate-700 hover:underline disabled:opacity-50"
            >
              {ticking ? "Ticker…" : "Kjør tick"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function ProductList({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items?: FinanceProductRow[];
  empty: string;
  tone: "positive" | "warning";
}) {
  const border =
    tone === "positive"
      ? "border-emerald-100 bg-emerald-50/40"
      : "border-amber-100 bg-amber-50/40";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${border}`}>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {!items || items.length === 0 ? (
        <p className="mt-1.5 text-xs text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {items.slice(0, 5).map((p) => (
            <li key={`${title}-${p.productId}`}>
              <p className="text-sm font-medium text-slate-800">{p.name}</p>
              <p className="text-xs text-slate-600">
                {p.marginPct != null ? `Margin ${p.marginPct} %` : "Margin —"}
                {p.units > 0
                  ? ` · fortjeneste ${Math.round(p.profit)} kr · ${p.units} solgt`
                  : ` · katalogpris ${Math.round(p.price)} kr`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: FinanceInsight }) {
  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {insight.question}
      </p>
      <p className="text-sm font-semibold text-slate-900">{insight.title}</p>
      <p className="text-xs text-slate-600">{insight.why}</p>
    </li>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}
