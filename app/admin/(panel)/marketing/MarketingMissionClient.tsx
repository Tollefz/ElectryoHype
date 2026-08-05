"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { MarketingDashboard } from "@/lib/marketing/insights";
import type { MarketingInsight } from "@/lib/marketing/insights";
import type { MarketingRecommendation } from "@/lib/marketing/recommendations";

type MissionPayload = {
  dashboard: MarketingDashboard;
  insights: MarketingInsight[];
  recommendations: MarketingRecommendation[];
  memory?: {
    memoryScore: number;
    rebuiltAt: string;
    patternCount: number;
    stories: Array<{
      id: string;
      text: string;
      polarity: "positive" | "negative" | "neutral";
      why: string;
    }>;
    topPositive: Array<{
      label: string;
      kind: string;
      experience: number;
      why: string[];
    }>;
    topNegative: Array<{
      label: string;
      kind: string;
      experience: number;
      why: string[];
    }>;
    channels: Array<{
      channel: string;
      conversionPct: number | null;
      purchaseRate: number | null;
      roas: number | null;
    }>;
    seasons: Array<{
      season: string;
      purchases: number;
      topChannel: string | null;
    }>;
    history: Array<{
      rebuiltAt: string;
      memoryScore: number;
      storyCount: number;
      topStory?: string;
    }>;
  };
  adSuggestions?: {
    weekLabel: string;
    headline: string;
    empty: boolean;
    emptyReason?: string;
    disclaimer: string;
    channels: Array<{
      channelId: string;
      channelLabel: string;
      products: Array<{
        productId: string;
        productName: string;
        marketingScore: number;
        why: string[];
      }>;
    }>;
  };
  traffic: {
    sources: Array<{ source: string; count: number }>;
    campaigns: Array<{ campaign: string; count: number }>;
  };
  topProducts?: Array<{
    productId: string;
    name: string;
    score: number;
    views: number;
    purchases: number;
  }>;
  worstProducts?: Array<{
    productId: string;
    name: string;
    score: number;
    views: number;
    purchases: number;
  }>;
  errors: string[];
  narrative: string;
  status: string;
  workerStatus?: string;
  lastEventAt: string | null;
  lastWorkerTickAt?: string | null;
};

/**
 * Marketing fordypning — Dashboard + Mission Control.
 * Linked from Rob's Desk. Not a new sidebar menu.
 * Observation + recommendations only.
 */
export default function MarketingMissionClient() {
  const [data, setData] = useState<MissionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/marketing?view=mission_control&days=${days}`
      );
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok) {
        setData(json as MissionPayload);
      }
    } catch {
      /* keep */
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const d = data?.dashboard;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Marketing · egen modul
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            Marketing Mission Control
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Live funnel, Marketing Score, Memory og AI-innsikt. Worker:{" "}
            {data?.workerStatus ?? "—"}. Jeg endrer ikke bud og publiserer ikke
            annonser.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value={7}>7 dager</option>
            <option value={14}>14 dager</option>
            <option value={30}>30 dager</option>
          </select>
          <Link
            href="/admin/dashboard"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Rob&apos;s Desk
          </Link>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laster…
        </div>
      ) : null}

      {data?.narrative ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          {data.narrative}
        </p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">
          {data?.adSuggestions?.headline || "Denne uken anbefaler AI"}
        </h2>
        <p className="text-xs text-slate-500">
          Forslag per kanal — CTR, margin, lager, pris, Store DNA, Memory,
          Feedback, Marketing Score. Ingen automatisk publisering.
        </p>
        {data?.adSuggestions?.empty ? (
          <p className="mt-3 text-sm text-slate-500">
            {data.adSuggestions.emptyReason || "Ingen forslag ennå."}
          </p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {(data?.adSuggestions?.channels || []).map((ch) => (
              <div
                key={ch.channelId}
                className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {ch.channelLabel}
                </p>
                {ch.products.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">Ingen forslag</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {ch.products.map((p) => (
                      <li key={p.productId}>
                        <p className="text-sm font-medium text-slate-800">
                          {p.productName}
                        </p>
                        <ul className="mt-0.5 space-y-0.5">
                          {p.why.map((w) => (
                            <li key={w} className="text-xs text-slate-600">
                              · {w}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">
          {data?.adSuggestions?.disclaimer}
        </p>
      </section>

      {/* Dashboard metrics */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">Dashboard</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <Card label="Sessions" value={d?.sessions ?? 0} />
          <Card label="CTR" value={fmtPct(d?.ctr)} />
          <Card label="Add to cart" value={d?.addToCart ?? 0} />
          <Card label="Checkout" value={d?.beginCheckout ?? 0} />
          <Card label="Purchases" value={d?.purchases ?? 0} />
          <Card label="Conv. rate" value={fmtPct(d?.conversionRate)} />
          <Card label="ROAS" value={d?.roas != null ? `${d.roas}x` : "—"} />
          <Card label="CPA" value={d?.cpa != null ? `${d.cpa} kr` : "—"} />
        </div>
        {d?.empty ? (
          <p className="mt-3 text-sm text-slate-500">
            Ingen first-party events ennå. Når kunder godtar cookies og handler,
            fylles tallene her — samme events som Meta/Google/TikTok/GA4.
          </p>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Top products (Marketing Score)">
          {(data?.topProducts || []).length === 0 ? (
            <Empty>Kjør worker-tick for å score produkter</Empty>
          ) : (
            data!.topProducts!.map((p) => (
              <Row
                key={p.productId}
                label={`${p.name} · ${p.views}v / ${p.purchases}k`}
                value={Math.round(p.score)}
              />
            ))
          )}
        </Panel>
        <Panel title="Worst products (med trafikk)">
          {(data?.worstProducts || []).length === 0 ? (
            <Empty>Ingen svake produkter med nok data</Empty>
          ) : (
            data!.worstProducts!.map((p) => (
              <Row
                key={p.productId}
                label={`${p.name} · ${p.views}v / ${p.purchases}k`}
                value={Math.round(p.score)}
              />
            ))
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-slate-900">
            AI Marketing Insights
          </h2>
          <p className="text-xs text-slate-500">Kun analyser — ikke prediksjoner</p>
          <ul className="mt-3 space-y-2">
            {(data?.insights || []).map((i) => (
              <li
                key={i.id}
                className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  {"question" in i && i.question ? i.question : i.kind}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">
                  {i.title}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">{i.detail}</p>
                {"why" in i && i.why ? (
                  <p className="mt-1.5 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">Hvorfor: </span>
                    {i.why}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-slate-900">
            Anbefalinger
          </h2>
          <p className="text-xs text-slate-500">
            Du må handle manuelt — AI utfører ikke
          </p>
          <ul className="mt-3 space-y-2">
            {(data?.recommendations || []).map((r) => (
              <li
                key={r.id}
                className={`rounded-xl border px-3 py-2.5 ${
                  r.severity === "urgent"
                    ? "border-rose-200 bg-rose-50"
                    : r.severity === "suggest"
                      ? "border-amber-200 bg-amber-50"
                      : "border-slate-100 bg-slate-50"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                <p className="mt-0.5 text-xs text-slate-700">{r.rationale}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">
          Marketing Memory — butikk-erfaring
        </h2>
        <p className="text-xs text-slate-500">
          Husker kampanjer, produkter, sesonger, kanaler, CTR, ROAS,
          konvertering og kjøpsrate. Påvirker anbefalinger som innsikt — aldri
          automatikk. Score {data?.memory?.memoryScore ?? 0}/100 ·{" "}
          {data?.memory?.patternCount ?? 0} mønstre.
        </p>
        {(data?.memory?.stories?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Ingen lærte historier ennå. Kjør worker-tick når events finnes.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data!.memory!.stories.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {s.polarity === "positive"
                    ? "✔ "
                    : s.polarity === "negative"
                      ? "⚠ "
                      : ""}
                  {s.text}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">{s.why}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-800">
              Positive mønstre
            </p>
            <ul className="mt-1 space-y-1.5 text-sm text-slate-700">
              {(data?.memory?.topPositive || []).length === 0 ? (
                <li className="text-slate-400">Ingen ennå</li>
              ) : (
                data!.memory!.topPositive.map((p) => (
                  <li key={`pos-${p.label}-${p.kind}`}>
                    <span className="font-medium">✔ {p.label}</span>
                    <span className="text-slate-500">
                      {" "}
                      · exp {p.experience}
                      {p.why[0] ? ` · ${p.why[0]}` : ""}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-amber-900">
              Negative mønstre
            </p>
            <ul className="mt-1 space-y-1.5 text-sm text-slate-700">
              {(data?.memory?.topNegative || []).length === 0 ? (
                <li className="text-slate-400">Ingen ennå</li>
              ) : (
                data!.memory!.topNegative.map((p) => (
                  <li key={`neg-${p.label}-${p.kind}`}>
                    <span className="font-medium">⚠ {p.label}</span>
                    <span className="text-slate-500">
                      {" "}
                      · exp {p.experience}
                      {p.why[0] ? ` · ${p.why[0]}` : ""}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
        {(data?.memory?.history?.length ?? 0) > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Historikk
            </p>
            <ul className="mt-1 space-y-1 text-xs text-slate-600">
              {data!.memory!.history
                .slice()
                .reverse()
                .map((h) => (
                  <li key={h.rebuiltAt}>
                    {new Date(h.rebuiltAt).toLocaleString("nb-NO")} · score{" "}
                    {h.memoryScore}
                    {h.topStory ? ` · ${h.topStory}` : ""}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Kilder">
          {(data?.traffic.sources || []).length === 0 ? (
            <Empty>Ingen utm_source ennå</Empty>
          ) : (
            data!.traffic.sources.map((s) => (
              <Row key={s.source} label={s.source} value={s.count} />
            ))
          )}
        </Panel>
        <Panel title="Kampanjer">
          {(data?.traffic.campaigns || []).length === 0 ? (
            <Empty>Ingen utm_campaign ennå</Empty>
          ) : (
            data!.traffic.campaigns.map((c) => (
              <Row key={c.campaign} label={c.campaign} value={c.count} />
            ))
          )}
        </Panel>
        <Panel title="Feil">
          {(data?.errors || []).length === 0 ? (
            <Empty>Ingen feil</Empty>
          ) : (
            data!.errors.map((e) => (
              <p key={e} className="text-xs text-rose-700">
                {e}
              </p>
            ))
          )}
        </Panel>
      </div>
    </div>
  );
}

function fmtPct(n: number | null | undefined) {
  return n != null ? `${n}%` : "—";
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="truncate text-slate-700">{label}</span>
      <span className="font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>;
}
