"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSmartPoll } from "@/lib/admin/useSmartPoll";
import type { SeoDeskStatus } from "@/lib/seo-brain/seo-desk-status";
import type { SeoInsight } from "@/lib/seo-brain/seo-insights";

const LIGHT: Record<
  SeoDeskStatus["status"],
  { label: string; className: string; dot: string }
> = {
  waiting: {
    label: "Venter",
    className: "bg-slate-50 text-slate-800 border-slate-200",
    dot: "bg-slate-400",
  },
  learning: {
    label: "Trenger arbeid",
    className: "bg-amber-50 text-amber-950 border-amber-200",
    dot: "bg-amber-500",
  },
  ready: {
    label: "Sunn",
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
 * Rob's Desk — SEO Brain (monitor only, never auto-writes content).
 */
export function DeskSeoBrain() {
  const [status, setStatus] = useState<SeoDeskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ticking, setTicking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/seo/brain?view=desk_status");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && data.status) {
        setStatus(data.status as SeoDeskStatus);
      }
    } catch {
      /* keep */
    } finally {
      setLoading(false);
    }
  }, []);

  useSmartPoll({
    tick: load,
    active: status?.status === "learning",
    activeMs: 60_000,
    idleMs: 180_000,
    enabled: true,
  });

  const light = status ? LIGHT[status.status] : LIGHT.waiting;
  const s = status?.summary;

  const runTick = async () => {
    setTicking(true);
    try {
      await fetch("/api/admin/seo/brain", {
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
    <section id="desk-seo" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">SEO Brain</h2>
          <p className="text-sm text-slate-600">
            Jeg overvåker metadata, indexering og muligheter — og forklarer
            hvorfor. Jeg genererer ikke innhold automatisk.
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
            Score {status?.seoScore ?? 0}/100
          </span>
        </div>
      </div>

      {loading && !status ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Auditerer SEO…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="SEO Score" value={status?.seoScore ?? 0} />
            <Metric
              label="Indexering"
              value={`${s?.indexingLikely ?? 0}/${s?.productCount ?? 0}`}
            />
            <Metric
              label="Warnings"
              value={(s?.warningCount ?? 0) + (s?.criticalCount ?? 0)}
            />
            <Metric label="Opportunities" value={s?.opportunityCount ?? 0} />
          </div>

          {status?.narrative ? (
            <p className="text-sm text-slate-700">{status.narrative}</p>
          ) : null}

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs text-slate-600">
            <p className="text-sm font-semibold text-slate-900">Struktur</p>
            <ul className="mt-1.5 space-y-0.5">
              <li>
                Sitemap / robots:{" "}
                {status?.structure.sitemapLikely ? "konfigurert" : "sjekk"} ·
                canonical {status?.structure.canonicalPattern}
              </li>
              <li>
                Product schema på PDP:{" "}
                {status?.structure.schemaOnPdp ? "ja" : "nei"} · FAQ-side:{" "}
                {status?.structure.faqSitePage ? "/faq" : "mangler"}
              </li>
              <li>{status?.structure.categorySeoNote}</li>
            </ul>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2.5">
              <h3 className="text-sm font-semibold text-slate-900">
                Hvorfor denne siden bør forbedres
              </h3>
              {(status?.worstPages?.length ?? 0) === 0 ? (
                <p className="mt-1.5 text-xs text-slate-500">
                  Ingen svake produktsider i snapshot.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-2">
                  {status!.worstPages.map((p) => (
                    <li key={p.path}>
                      <p className="text-sm font-medium text-slate-800">
                        {p.name}
                        <span className="ml-1.5 text-[10px] text-slate-500">
                          score {p.score}
                        </span>
                      </p>
                      <p className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">
                          Hvorfor:{" "}
                        </span>
                        {p.why}
                      </p>
                      <Link
                        href={p.path}
                        className="text-[11px] font-medium text-emerald-700 hover:underline"
                      >
                        {p.path}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              <PanelList
                title="Warnings"
                items={(status?.warnings || []).slice(0, 5).map((w) => ({
                  title: w.name,
                  detail: w.message,
                  why: w.why,
                }))}
                empty="Ingen kritiske/advarsler akkurat nå."
                tone="warning"
              />
              <PanelList
                title="Opportunities"
                items={(status?.opportunities || []).slice(0, 5).map((o) => ({
                  title: o.name,
                  detail: o.message,
                  why: o.why,
                }))}
                empty="Ingen åpne muligheter i topplisten."
                tone="neutral"
              />
            </div>
          </div>

          <details className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
              SEO Insights
            </summary>
            <ul className="mt-2 space-y-2">
              {(status?.insights || []).map((i) => (
                <InsightRow key={i.id} insight={i} />
              ))}
            </ul>
          </details>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <p>
              Oppdatert{" "}
              {status?.rebuiltAt
                ? new Date(status.rebuiltAt).toLocaleString("nb-NO")
                : "—"}
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

function PanelList({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: Array<{ title: string; detail: string; why: string }>;
  empty: string;
  tone: "warning" | "neutral";
}) {
  const border =
    tone === "warning"
      ? "border-amber-100 bg-amber-50/40"
      : "border-slate-100 bg-slate-50/60";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${border}`}>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1.5 text-xs text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {items.map((i, idx) => (
            <li key={`${title}-${idx}`}>
              <p className="text-sm font-medium text-slate-800">{i.title}</p>
              <p className="text-xs text-slate-600">{i.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InsightRow({ insight }: { insight: SeoInsight }) {
  return (
    <li className="rounded-lg border border-slate-100 bg-white px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {insight.question}
      </p>
      <p className="text-sm font-semibold text-slate-900">{insight.title}</p>
      <p className="text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Hvorfor: </span>
        {insight.why}
      </p>
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
