"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import toast from "react-hot-toast";

type Improvement = {
  id: string;
  kind: string;
  title: string;
  why: unknown;
  confidence: number | null;
  before: unknown;
  proposed: unknown;
  product?: {
    id: string;
    name?: string;
    title?: string;
    slug: string;
    qualityScore: number | null;
  } | null;
};

type Mission = {
  id: string;
  title: string;
  brief: string | null;
  progressDone: number;
  targetCount: number | null;
  status: string;
};

type Props = {
  initialPending: Improvement[];
  initialMissions: Mission[];
  weekStats: { improved: number; published: number; removed: number };
  summary: string | null;
};

function asLines(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

function benefitsFor(kind: string): string[] {
  switch (kind) {
    case "price_adjust":
      return ["Bedre margin eller mer konkurransedyktig pris", "Synlig i historikk for læring"];
    case "remove_candidate":
      return ["Renere katalog", "Mindre støy for kunder"];
    case "content_rewrite":
      return ["Klarere produkttekst", "Høyere tillit i butikken"];
    case "image_improve":
      return ["Sterkere førsteinntrykk", "Færre usikre kjøp"];
    case "supplier_switch":
      return ["Mulig lavere kostnad eller bedre levering", "Du beholder kontroll — byttet skjer ikke uten deg"];
    default:
      return ["Butikken blir litt bedre", "AI lærer av avgjørelsen din"];
  }
}

function risksFor(kind: string): string[] {
  switch (kind) {
    case "price_adjust":
      return ["Prisen kan bli for høy eller for lav for markedet"];
    case "remove_candidate":
      return ["Produktet merkes inaktivt — kan aktiveres igjen senere"];
    case "supplier_switch":
      return ["Ny leverandør kan ha annen kvalitet eller ledetid"];
    default:
      return ["Endringen kan kreve manuell justering etterpå"];
  }
}

function ifApproved(kind: string): string {
  switch (kind) {
    case "price_adjust":
      return "Prisen oppdateres på produktet. Endringen logges, og AI bruker den i senere tillitsscoring.";
    case "remove_candidate":
      return "Produktet deaktiveres i butikken. Det publiseres ikke automatisk igjen.";
    case "supplier_switch":
      return "Forslaget godkjennes i historikken. Selve leverandørbyttet krever fortsatt at du følger opp i produktet — AI bytter ikke stille.";
    case "content_rewrite":
    case "image_improve":
      return "Forslaget markeres godkjent. Du (eller AI-oppdrag) kan følge opp endringen på produktsiden.";
    default:
      return "Forslaget godkjennes og lagres. Ingenting publiseres uten at du sier ja et annet sted.";
  }
}

function storySteps(p: Improvement): string[] {
  const why = asLines(p.why)[0] || p.title;
  return [
    why,
    "Jeg byttet ikke automatisk.",
    "Du må godkjenne før noe skjer i butikken.",
  ];
}

export function DeskSelfImprovePanel({
  initialPending,
  initialMissions,
  weekStats,
  summary,
}: Props) {
  const [pending, setPending] = useState(() =>
    Array.isArray(initialPending) ? initialPending : []
  );
  const [missions, setMissions] = useState(() =>
    Array.isArray(initialMissions) ? initialMissions : []
  );
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const safeWeek = weekStats || { improved: 0, published: 0, removed: 0 };

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/improve");
    const data = await res.json();
    if (data?.ok) {
      setPending(Array.isArray(data.pending) ? data.pending : []);
      setMissions(Array.isArray(data.missions) ? data.missions : []);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runNightly() {
    setRunning(true);
    try {
      const res = await fetch("/api/admin/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_nightly" }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      toast.success("Jeg har sett over butikken på nytt");
      await refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setRunning(false);
    }
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decide", id, decision }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      toast.success(decision === "approved" ? "Godkjent — jeg følger opp" : "Avvist — notert");
      await refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      id="ai-approvals"
      className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 via-white to-amber-50/40 p-4 shadow-sm sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Beslutninger jeg trenger deg på
          </h2>
          <p className="text-sm text-slate-600">
            Jeg foreslår. Du bestemmer. Hver beslutning forklarer hvorfor, fordeler og risiko.
          </p>
        </div>
        <button
          type="button"
          disabled={running}
          onClick={() => void runNightly()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Se over butikken nå
        </button>
      </div>

      {summary && (
        <p className="mb-4 rounded-xl border border-emerald-100 bg-white/90 p-3 text-sm leading-relaxed text-slate-700">
          {summary}
        </p>
      )}

      <p className="mb-4 text-sm text-slate-600">
        Denne uken: forbedret {safeWeek.improved}, publisert {safeWeek.published}, fjernet{" "}
        {safeWeek.removed}. {pending.length} venter på deg.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Venter på deg</h3>
          {pending.length === 0 ? (
            <div className="rounded-xl border border-dashed border-emerald-200 bg-white/70 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-800">Ingenting å godkjenne akkurat nå.</p>
              <p className="mt-1">
                Jeg fortsetter å se etter pris, kvalitet og leverandør. Når jeg er usikker, legger
                jeg det her — med forklaring.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Neste steg: lukk denne fanen, eller trykk «Se over butikken nå» hvis du vil at jeg
                sjekker på nytt.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {pending.map((p) => {
                const why = asLines(p.why);
                const conf = p.confidence != null ? Math.round(p.confidence) : null;
                const steps = storySteps(p);
                return (
                  <li
                    key={p.id}
                    className="rounded-xl border border-slate-100 bg-white p-4 text-sm shadow-sm"
                  >
                    <p className="font-semibold text-slate-900">{p.title}</p>
                    {p.product && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {p.product.name || p.product.title}
                      </p>
                    )}

                    <ol className="mt-3 space-y-1 border-l-2 border-emerald-200 pl-3 text-xs text-slate-700">
                      {steps.map((s, i) => (
                        <li key={i}>
                          <span className="text-emerald-700">↓</span> {s}
                        </li>
                      ))}
                    </ol>

                    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-slate-500">
                          Hvorfor
                        </dt>
                        <dd className="mt-0.5 text-slate-700">
                          {why.length ? why.join(" · ") : "Se historien over."}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-slate-500">
                          Confidence
                        </dt>
                        <dd className="mt-0.5 text-slate-700">
                          {conf != null ? `${conf}%` : "Ikke scorert"}
                          {p.product?.qualityScore != null
                            ? ` · produktkvalitet ${Math.round(p.product.qualityScore)}`
                            : ""}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-slate-500">
                          Fordeler
                        </dt>
                        <dd className="mt-0.5 text-slate-700">
                          {benefitsFor(p.kind).join(" · ")}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-amber-700">
                          Risiko
                        </dt>
                        <dd className="mt-0.5 text-slate-700">
                          {risksFor(p.kind).join(" · ")}
                        </dd>
                      </div>
                    </dl>

                    <p className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">Hvis du godkjenner: </span>
                      {ifApproved(p.kind)}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => void decide(p.id, "approved")}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        <Check className="h-3.5 w-3.5" /> Godkjenn
                      </button>
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => void decide(p.id, "rejected")}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                      >
                        <X className="h-3.5 w-3.5" /> Nei, ikke nå
                      </button>
                      {p.product?.id && (
                        <Link
                          href={`/admin/products/edit/${p.product.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                        >
                          Fordypning
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Kategorioppdrag</h3>
          <div className="rounded-xl border border-dashed border-emerald-200 bg-white/70 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-800">
              Oppdragene ligger i Digital Buyer over.
            </p>
            <p className="mt-1">
              Velg Gaming, Mobil, Kontor… — jeg bygger underkategorier og produkter selv.
            </p>
            <a
              href="#desk-missions"
              className="mt-3 inline-block rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Gå til AI-oppdrag
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
