"use client";

import type { RealStoreSnapshot } from "@/lib/real-store/types";
import Link from "next/link";

/**
 * Soft narrative — not a dark ERP scoreboard.
 * Prefer collapsed under "Mer om butikken" on Rob's Desk.
 */
export function DeskRealStorePanel({ snapshot }: { snapshot: RealStoreSnapshot | null | undefined }) {
  const s = snapshot || {
    maturityScore: 0,
    maturityLabel: "Ikke klar ennå",
    gates: [] as RealStoreSnapshot["gates"],
    automation: {
      areas: [] as RealStoreSnapshot["automation"]["areas"],
      adminMinutesPerDayEst: 30,
      overallPct: 0,
    },
    catalogQualityAvg: null as number | null,
    catalogIssues: [] as RealStoreSnapshot["catalogIssues"],
    performanceProblems: [] as RealStoreSnapshot["performanceProblems"],
    dailyImprovements: 0,
    workSavedHours30d: 0,
    aiReview: null as string | null,
    readyFor20MinDay: false,
  };
  const unmet = (s.gates || []).filter((g) => g && !g.met);
  const nextGate = unmet[0];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            Hvordan butikken står
          </p>
          <h2 className="text-base font-semibold text-slate-900">
            {s.maturityLabel}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Jeg måler om vi er klare for en arbeidsdag under 20 minutter — ikke for å vise
            dashbordtall, men for å vite hva vi bør gjøre neste.
          </p>
        </div>
        <div
          className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
            s.readyFor20MinDay
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-900"
          }`}
        >
          {s.readyFor20MinDay
            ? "≤ 20 min/dag mulig"
            : `Ca. ${s.automation?.adminMinutesPerDayEst ?? "—"} min/dag for deg`}
        </div>
      </div>

      <div className="mb-4 space-y-2 text-sm text-slate-700">
        <p>
          Automation {s.automation?.overallPct ?? 0} % · katalogkvalitet{" "}
          {s.catalogQualityAvg != null ? s.catalogQualityAvg : "—"} · tid spart{" "}
          {s.workSavedHours30d ?? 0} t (30 dager).
        </p>
        {nextGate ? (
          <p>
            <span className="font-medium text-slate-900">Neste steg: </span>
            {nextGate.label}
            {nextGate.detail ? ` — ${nextGate.detail}` : ""}.
          </p>
        ) : (
          <p className="font-medium text-emerald-800">
            Alle modenhetsmål er nådd. Fortsett å godkjenne det jeg foreslår.
          </p>
        )}
      </div>

      {((s.catalogIssues || []).length > 0 ||
        (s.performanceProblems || []).length > 0) && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <h3 className="text-sm font-semibold text-amber-900">Jeg trenger deg her</h3>
          <ul className="mt-2 space-y-1 text-sm text-amber-950/90">
            {(s.performanceProblems || []).map((p) => (
              <li key={p.id}>
                <Link href="/admin/suppliers/workers" className="underline">
                  {p.label}
                </Link>
                : {p.detail}
              </li>
            ))}
            {(s.catalogIssues || []).map((i) => (
              <li key={i.id}>
                <Link href={i.href} className="underline">
                  {i.count} × {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.aiReview && (
        <p className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
          {s.aiReview}
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-800">
          Vis alle mål og automation-områder
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <ul className="space-y-1.5 text-sm">
            {(s.automation?.areas || []).map((a) => (
              <li key={a.id} className="flex justify-between text-slate-700">
                <span>{a.label}</span>
                <span className="font-semibold">{a.pct} %</span>
              </li>
            ))}
          </ul>
          <ul className="space-y-1.5 text-sm">
            {(s.gates || []).map((g) => (
              <li key={g.id} className={g.met ? "text-emerald-700" : "text-amber-800"}>
                {g.met ? "✔" : "○"} {g.label}
                {g.detail ? (
                  <span className="ml-1 text-xs text-slate-500">{g.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}
