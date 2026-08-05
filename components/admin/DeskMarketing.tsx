"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSmartPoll } from "@/lib/admin/useSmartPoll";
import type { MarketingDeskStatus } from "@/lib/marketing/desk-status";
import type { BrainProductFact } from "@/lib/marketing/marketing-brain-board";
import type { MarketingInsight } from "@/lib/marketing/marketing-insights";

const LIGHT: Record<
  MarketingDeskStatus["status"],
  { label: string; className: string; dot: string }
> = {
  waiting: {
    label: "Venter på data",
    className: "bg-slate-50 text-slate-800 border-slate-200",
    dot: "bg-slate-400",
  },
  learning: {
    label: "Lærer",
    className: "bg-amber-50 text-amber-950 border-amber-200",
    dot: "bg-amber-500",
  },
  ready: {
    label: "Klar",
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
 * Rob's Desk — Marketing Brain (facts only, no LLM).
 */
export function DeskMarketing() {
  const [status, setStatus] = useState<MarketingDeskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ticking, setTicking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/marketing?view=desk_status");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && data.status) {
        setStatus(data.status as MarketingDeskStatus);
      }
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);

  useSmartPoll({
    tick: load,
    active:
      status?.status === "learning" || status?.workerStatus === "running",
    activeMs: 20_000,
    idleMs: 60_000,
    enabled: true,
  });

  const light = status ? LIGHT[status.status] : LIGHT.waiting;
  const brain = status?.brain;
  const t = brain?.trafficLast24h;

  const runTick = async () => {
    setTicking(true);
    try {
      await fetch("/api/admin/marketing", {
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
    <section id="desk-marketing" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Marketing Brain
          </h2>
          <p className="text-sm text-slate-600">
            Fakta fra trafikk, score og katalog — ingen LLM. Du bestemmer
            budsjett. Jeg publiserer aldri annonser.
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
            Worker: {status?.workerStatus ?? "—"}
          </span>
        </div>
      </div>

      {loading && !status ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Henter Marketing Brain…
        </div>
      ) : (
        <>
          {/* Trafikk siste døgn */}
          <Panel title="Trafikk siste døgn" fact={t?.fact}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <Metric label="Sessions" value={t?.sessions ?? 0} />
              <Metric label="Sidevisninger" value={t?.pageViews ?? 0} />
              <Metric label="Produktvisninger" value={t?.viewItem ?? 0} />
              <Metric label="Handlekurv" value={t?.addToCart ?? 0} />
              <Metric label="Checkout" value={t?.beginCheckout ?? 0} />
              <Metric label="Kjøp" value={t?.purchases ?? 0} />
              <Metric
                label="Omsetning"
                value={
                  t?.revenue
                    ? `${Math.round(t.revenue)} kr`
                    : "0 kr"
                }
              />
            </div>
          </Panel>

          {/* Beste kanal */}
          <Panel
            title="Beste kanal"
            fact={
              brain?.bestChannel?.fact ||
              "Ingen kanaldata ennå (utm_source / events)."
            }
          >
            {brain?.bestChannel ? (
              <p className="text-sm font-semibold text-slate-900">
                {brain.bestChannel.channel}
                <span className="ml-2 text-xs font-normal text-slate-600">
                  {brain.bestChannel.sharePct} % av events ·{" "}
                  {brain.bestChannel.purchases} kjøp
                </span>
              </p>
            ) : null}
          </Panel>

          <div className="grid gap-3 md:grid-cols-2">
            <FactList
              title="Mest populære produkter"
              empty="Ingen produktvisninger siste 7 dager."
              items={brain?.mostPopular}
            />
            <FactList
              title="Høyeste konvertering"
              empty="Trenger ≥ 5 visninger og minst ett kjøp."
              items={brain?.highestConversion}
            />
            <FactList
              title="Laveste konvertering"
              empty="Trenger ≥ 5 visninger."
              items={brain?.lowestConversion}
            />
            <FactList
              title="Høy margin + høy CTR"
              empty="Ingen treff (margin ≥ 45 % og CTR-proxy ≥ 5 %)."
              items={brain?.highMarginHighCtr}
            />
            <FactList
              title="AI anbefaler å markedsføre"
              empty="Ingen produkter med score ≥ 65, lager og signal."
              items={brain?.recommendPromote}
              tone="positive"
            />
            <FactList
              title="AI mener bør pauses"
              empty="Ingen produkter med mange visninger og 0 kjøp."
              items={brain?.recommendPause}
              tone="warning"
            />
            <FactList
              title="Trenger bedre bilder"
              empty="Alle aktive produkter har ≥ 3 bilder."
              items={brain?.needsBetterImages}
              tone="warning"
            />
            <FactList
              title="Trenger bedre beskrivelse"
              empty="Alle aktive produkter har ≥ 150 tegn beskrivelse."
              items={brain?.needsBetterDescription}
              tone="warning"
            />
          </div>

          {/* Channel ad suggestions — compact */}
          {!status?.adSuggestions?.empty ? (
            <Panel
              title="Kanal-forslag denne uken"
              fact={status?.adSuggestions?.disclaimer}
            >
              <ul className="space-y-1.5">
                {(status?.adSuggestions?.channels || []).map((ch) =>
                  ch.products.length === 0 ? null : (
                    <li key={ch.channelId} className="text-sm text-slate-800">
                      <span className="font-semibold">{ch.channelLabel}:</span>{" "}
                      {ch.products.map((p) => p.productName).join(", ")}
                    </li>
                  )
                )}
              </ul>
            </Panel>
          ) : null}

          {/* Insights + memory under details to avoid overcrowding */}
          <details className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
              Flere innsikter og Memory
            </summary>
            <div className="mt-3 space-y-3">
              <ul className="space-y-2">
                {(status?.topInsights || []).slice(0, 4).map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </ul>
              {(status?.memory?.stories?.length ?? 0) > 0 ? (
                <ul className="space-y-1.5">
                  {status!.memory!.stories.slice(0, 3).map((s) => (
                    <li key={s.id} className="text-xs text-slate-700">
                      <span className="font-medium">{s.text}</span> — {s.why}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <p>
              Oppdatert{" "}
              {brain?.generatedAt
                ? new Date(brain.generatedAt).toLocaleString("nb-NO")
                : "—"}
              {" · "}
              Worker:{" "}
              {status?.lastWorkerTickAt
                ? new Date(status.lastWorkerTickAt).toLocaleString("nb-NO")
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
                href="/admin/marketing"
                className="font-medium text-emerald-700 hover:underline"
              >
                Alle innsikter →
              </Link>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Panel({
  title,
  fact,
  children,
}: {
  title: string;
  fact?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {fact ? <p className="text-xs text-slate-600">{fact}</p> : null}
      {children}
    </div>
  );
}

function FactList({
  title,
  items,
  empty,
  tone = "neutral",
}: {
  title: string;
  items?: BrainProductFact[];
  empty: string;
  tone?: "neutral" | "positive" | "warning";
}) {
  const border =
    tone === "positive"
      ? "border-emerald-100 bg-emerald-50/40"
      : tone === "warning"
        ? "border-amber-100 bg-amber-50/40"
        : "border-slate-100 bg-slate-50/60";

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${border}`}>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {!items || items.length === 0 ? (
        <p className="mt-1.5 text-xs text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {items.map((p) => (
            <li key={`${title}-${p.productId}`}>
              <p className="text-sm font-medium text-slate-800">{p.name}</p>
              <p className="text-xs text-slate-600">{p.fact}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: MarketingInsight }) {
  return (
    <li className="rounded-lg border border-slate-100 bg-white px-2.5 py-2">
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
