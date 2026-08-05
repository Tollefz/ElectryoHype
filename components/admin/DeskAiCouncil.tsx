"use client";

import type { AiManagementMissionStatus } from "@/lib/council/types";

const OVERALL: Record<
  AiManagementMissionStatus["overall"],
  { label: string; className: string; dot: string }
> = {
  green: {
    label: "Rolig",
    className: "border-emerald-200 bg-emerald-50 text-emerald-900",
    dot: "bg-emerald-500",
  },
  amber: {
    label: "Trenger blikk",
    className: "border-amber-200 bg-amber-50 text-amber-950",
    dot: "bg-amber-500",
  },
  red: {
    label: "Kritisk",
    className: "border-rose-200 bg-rose-50 text-rose-950",
    dot: "bg-rose-500",
  },
  grey: {
    label: "Venter",
    className: "border-slate-200 bg-slate-50 text-slate-700",
    dot: "bg-slate-400",
  },
};

const HEALTH: Record<
  AiManagementMissionStatus["members"][number]["health"],
  string
> = {
  ready: "bg-emerald-500",
  learning: "bg-amber-500",
  waiting: "bg-slate-400",
  error: "bg-rose-500",
  offline: "bg-slate-300",
};

type Props = {
  mission: AiManagementMissionStatus | null | undefined;
  loading?: boolean;
};

/**
 * Mission Control — one unified status for the AI Management Team.
 * Presentation only; Rob prioritizes; human approves.
 */
export function DeskAiCouncil({ mission, loading }: Props) {
  if (loading && !mission) {
    return (
      <div
        id="ai-council-mission"
        className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-500"
      >
        Samler AI Council…
      </div>
    );
  }

  if (!mission) {
    return (
      <div
        id="ai-council-mission"
        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
      >
        AI Council har ikke rapportert ennå. Rob finner ikke på noe i mellomtiden.
      </div>
    );
  }

  const light = OVERALL[mission.overall] || OVERALL.grey;

  return (
    <div
      id="ai-council-mission"
      className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            AI Management Team · Mission Control
          </p>
          <h2 className="mt-1 font-serif text-lg font-semibold text-slate-900">
            {mission.headline}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {mission.narrative}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${light.className}`}
        >
          <span className={`h-2 w-2 rounded-full ${light.dot}`} />
          {light.label}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="AI-er" value={`${mission.reportingCount}/${mission.memberCount}`} />
        <Stat label="Kritiske" value={String(mission.criticalCount)} />
        <Stat label="Forslag" value={String(mission.proposalCount)} />
        <Stat
          label="Prioriteringer"
          value={String(mission.topPriorities.length)}
        />
      </dl>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(mission.members || []).map((m) => (
          <li key={m.memberId}>
            <a
              href={m.href || "#rob-ceo"}
              className="block rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 transition hover:border-slate-200 hover:bg-white"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${HEALTH[m.health] || HEALTH.waiting}`}
                  aria-hidden
                />
                <span className="text-sm font-semibold text-slate-900">
                  {m.label}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                {m.topHeadline || m.summary || "Ingen prioritet"}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-lg font-semibold tabular-nums text-slate-900">
        {value}
      </dd>
    </div>
  );
}
