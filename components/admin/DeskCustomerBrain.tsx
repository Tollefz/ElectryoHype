"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSmartPoll } from "@/lib/admin/useSmartPoll";
import type { CustomerDeskStatus } from "@/lib/customer/customer-desk-status";
import type { CustomerProfile } from "@/lib/customer/customer-score";
import type { CustomerInsight } from "@/lib/customer/customer-insights";

const LIGHT: Record<
  CustomerDeskStatus["status"],
  { label: string; className: string; dot: string }
> = {
  waiting: {
    label: "Venter",
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
 * Rob's Desk — Customer Brain Mission Control.
 * Recommendations only — never auto-emails.
 */
export function DeskCustomerBrain() {
  const [status, setStatus] = useState<CustomerDeskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ticking, setTicking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/customers/brain?view=desk_status");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && data.status) {
        setStatus(data.status as CustomerDeskStatus);
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
    activeMs: 45_000,
    idleMs: 120_000,
    enabled: true,
  });

  const light = status ? LIGHT[status.status] : LIGHT.waiting;
  const c = status?.counts;

  const runTick = async () => {
    setTicking(true);
    try {
      await fetch("/api/admin/customers/brain", {
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
    <section id="desk-customer" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            AI CRM · Customer Brain
          </h2>
          <p className="text-sm text-slate-600">
            Butikkens CRM — jeg lærer språk, kilde, kjøp, LTV og personas. Kun
            forståelse og anbefaling. Ingen auto-markedsføring.
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
            Memory {status?.memoryScore ?? 0}/100
          </span>
        </div>
      </div>

      {loading && !status ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Scorer kunder…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Scorert" value={c?.scored ?? 0} />
            <Metric label="Nye" value={c?.newCustomers ?? 0} />
            <Metric label="Tilbakevendende" value={c?.returning ?? 0} />
            <Metric label="VIP" value={c?.vip ?? 0} />
            <Metric label="Churn-risiko" value={c?.churnRisk ?? 0} />
            <Metric label="Høy LTV" value={c?.highLtv ?? 0} />
          </div>

          {status?.narrative ? (
            <p className="text-sm text-slate-700">{status.narrative}</p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <CohortList
              title="Nye kunder"
              items={status?.mission.newCustomers}
              empty="Ingen engangskjøpere."
            />
            <CohortList
              title="Tilbakevendende"
              items={status?.mission.returning}
              empty="Ingen med ≥2 kjøp."
              tone="positive"
            />
            <CohortList
              title="VIP"
              items={status?.mission.vip}
              empty="Ingen VIP ennå."
              tone="positive"
            />
            <CohortList
              title="Risiko for churn"
              items={status?.mission.churnRisk}
              empty="Ingen churn-risiko."
              tone="warning"
            />
            <CohortList
              title="Høy livstidsverdi"
              items={status?.mission.highLtv}
              empty="Ingen med LTV ≥ 1500 kr."
              tone="positive"
            />
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
              <h3 className="text-sm font-semibold text-slate-900">
                Toppsegmenter
              </h3>
              {(status?.topSegments?.length ?? 0) === 0 ? (
                <p className="mt-1.5 text-xs text-slate-500">
                  Gaming, Mobil, Apple, Smart Home, Kontor, Premium,
                  Prisbevisst — når kjøp finnes.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {status!.topSegments.map((s) => (
                    <li
                      key={s.id}
                      className="flex justify-between text-sm text-slate-800"
                    >
                      <span>{s.label}</span>
                      <span className="tabular-nums text-slate-500">
                        {s.customers}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">
              AI anbefaler
            </h3>
            <p className="text-xs text-slate-500">
              Kun forslag — ikke markedsføring. Eksempel: Gaming, ikke Mobil.
            </p>
            {(status?.recommendations?.length ?? 0) === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                Når kunder har kjøpshistorikk, sier jeg hvilken kategori som
                passer — og hvilken som ikke gjør det.
              </p>
            ) : (
              <ul className="space-y-2">
                {status!.recommendations.map((r) => (
                  <li
                    key={r.customerId}
                    className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2.5"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {r.email}
                      {r.persona ? (
                        <span className="ml-2 text-xs font-medium text-emerald-800">
                          {r.persona}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {"headline" in r && r.headline
                        ? r.headline
                        : `Denne kunden passer best med: ${r.shouldGet.join(", ")}${
                            r.avoid.length
                              ? ` · ikke ${r.avoid.join(", ")}`
                              : ""
                          }`}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {[
                        r.language ? `Språk: ${r.language}` : null,
                        r.favoriteCategory
                          ? `Favoritt: ${r.favoriteCategory}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">
                        Hvorfor:{" "}
                      </span>
                      {r.why}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <details className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
              Insights
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
                href="/admin/customers"
                className="font-medium text-emerald-700 hover:underline"
              >
                Kunder →
              </Link>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function CohortList({
  title,
  items,
  empty,
  tone = "neutral",
}: {
  title: string;
  items?: CustomerProfile[];
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
          {items.slice(0, 5).map((p) => (
            <li key={p.customerId}>
              <p className="text-sm font-medium text-slate-800">{p.email}</p>
              <p className="text-xs text-slate-600">
                {p.persona ? `${p.persona} · ` : ""}
                LTV {Math.round(p.score.lifetimeValue)} kr ·{" "}
                {p.score.orderCount} ordre · AOV {Math.round(p.score.aov)} kr
                {p.favoriteCategory ? ` · ${p.favoriteCategory}` : ""}
              </p>
              <p className="text-[11px] text-slate-500">
                {[
                  p.language ? `Språk ${p.language}` : null,
                  p.sources?.length
                    ? `Kilde ${p.sources.slice(0, 2).join(", ")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Profil bygges fra kjøp"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InsightRow({ insight }: { insight: CustomerInsight }) {
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
