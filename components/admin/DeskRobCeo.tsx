"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { useSmartPoll } from "@/lib/admin/useSmartPoll";
import type {
  CeoDeskStatus,
  CeoDomainSection,
  CeoProposal,
} from "@/lib/ceo/types";
import type { AiManagementMissionStatus } from "@/lib/council/types";
import { DeskAiCouncil } from "@/components/admin/DeskAiCouncil";

/**
 * Rob CEO — butikkens administrerende direktør på Rob's Desk.
 * Leser AI Council. Utfører aldri — Approval Gate only.
 */
export function DeskRobCeo() {
  const [status, setStatus] = useState<CeoDeskStatus | null>(null);
  const [mission, setMission] = useState<AiManagementMissionStatus | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [ignored, setIgnored] = useState<Record<string, true>>({});
  const [expanded, setExpanded] = useState<Record<string, true>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/council");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        if (data.ceo) setStatus(data.ceo as CeoDeskStatus);
        if (data.mission) setMission(data.mission as AiManagementMissionStatus);
      }
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);

  useSmartPoll({
    tick: load,
    active: true,
    activeMs: 120_000,
    idleMs: 180_000,
    enabled: true,
  });

  const brief = status?.brief;
  const proposals = (brief?.proposals || []).filter((p) => !ignored[p.id]);

  const ignoreProposal = async (id: string) => {
    setIgnored((prev) => ({ ...prev, [id]: true }));
    try {
      await fetch("/api/admin/ceo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ignore", proposalId: id }),
      });
    } catch {
      /* local dismiss still applies */
    }
  };

  return (
    <section
      id="rob-ceo"
      className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 p-5 shadow-sm sm:p-8"
    >
      <div
        className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-emerald-100/40 blur-3xl"
        aria-hidden
      />
      <div className="relative space-y-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Rob CEO
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {brief?.greeting || (loading ? "God morgen." : "Hei.")}
          </h1>
          <p className="mt-2 max-w-2xl text-base text-slate-600">
            {brief?.intro ||
              "Jeg analyserer butikken via AI Council — Buyer, Marketing, Orders, Finance, SEO og Customer. Jeg finner ikke på noe."}
          </p>
        </div>

        <DeskAiCouncil mission={mission} loading={loading} />

        {loading && !brief ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Leser fakta fra AI Council…
          </div>
        ) : (
          <>
            <div className="max-w-2xl space-y-6">
              {(brief?.sections || []).map((section) => (
                <DomainBlock key={section.domain} section={section} />
              ))}
            </div>

            <p className="max-w-2xl text-sm font-medium text-emerald-900">
              {brief?.closing ||
                "Jeg utfører ingenting uten din godkjenning."}
            </p>

            <ApprovalGate
              proposals={proposals}
              expanded={expanded}
              onExpand={(id) =>
                setExpanded((prev) => ({ ...prev, [id]: true }))
              }
              onIgnore={ignoreProposal}
            />
          </>
        )}
      </div>
    </section>
  );
}

function DomainBlock({ section }: { section: CeoDomainSection }) {
  return (
    <div>
      <h2 className="font-serif text-lg font-semibold text-slate-900">
        {section.label}:
      </h2>
      {section.error ? (
        <p className="mt-1 text-sm text-amber-800">
          Kunne ikke lese {section.sourceAi}. Jeg finner ikke på noe i stedet.
        </p>
      ) : section.lines.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">Ingen kritiske funn i dag.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {section.lines.map((line, i) => (
            <li key={`${section.domain}-${i}`} className="text-slate-800">
              <p className="text-base leading-relaxed">{line.headline}</p>
              <p className="mt-0.5 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Hvorfor: </span>
                {line.why}
              </p>
              <p className="text-xs text-slate-500">
                Data: {line.data} · Sikkerhet {line.confidence}% ·{" "}
                {section.sourceAi}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ApprovalGate({
  proposals,
  expanded,
  onExpand,
  onIgnore,
}: {
  proposals: CeoProposal[];
  expanded: Record<string, true>;
  onExpand: (id: string) => void;
  onIgnore: (id: string) => void;
}) {
  return (
    <div id="rob-ceo-gate" className="border-t border-slate-200/80 pt-6">
      <h2 className="font-serif text-xl font-semibold text-slate-900">
        Approval Gate
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        AI Council foreslår. Du bestemmer. Ingen AI publiserer, endrer priser,
        sender e-post eller bruker annonsekroner.
      </p>

      {proposals.length === 0 ? (
        <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          Ingen beslutninger som venter — du kan gå videre.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {proposals.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-slate-200 bg-white/80 p-4"
            >
              <p className="text-base font-medium text-slate-900">
                {p.headline}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Hvorfor: </span>
                {p.why}
              </p>
              {expanded[p.id] ? (
                <p className="mt-1 text-xs text-slate-500">
                  Data: {p.data} · Sikkerhet {p.confidence}% · {p.sourceAi}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  {p.sourceAi} · {p.confidence}% sikker
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {p.actions.map((a) => {
                  if (a.id === "ignore") {
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onIgnore(p.id)}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        ✔ Ignorer
                      </button>
                    );
                  }
                  if (a.id === "details") {
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          onExpand(p.id);
                          if (a.href) {
                            const el = document.querySelector(a.href);
                            el?.scrollIntoView({ behavior: "smooth" });
                          }
                        }}
                        className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-950 hover:bg-sky-100"
                      >
                        ✔ Vis detaljer
                      </button>
                    );
                  }
                  return (
                    <a
                      key={a.id}
                      href={a.href || "#"}
                      className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-100"
                    >
                      ✔ {a.label}
                    </a>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
