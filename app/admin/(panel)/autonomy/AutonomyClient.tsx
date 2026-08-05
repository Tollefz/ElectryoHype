"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Loader2,
  Bot,
  Play,
  Shield,
  Sparkles,
  ArrowRight,
} from "lucide-react";

type Policy = {
  mode: "off" | "semi" | "auto";
  scheduleEnabled: boolean;
  maxImportsPerRun: number;
  minMerchandiserScore: number;
  deepAnalyzeTop: number;
  storeGoal: {
    quality: number;
    margin: number;
    customerExperience: number;
    minimizeManual: number;
  };
  qualityGate: {
    minImages: number;
    minSpecs: number;
    minMarginPct: number;
    minMerchandiserScore: number;
    minCategoryConfidence: number;
    minOverallConfidence: number;
    requireKnownCategory: boolean;
  };
};

type Brief = {
  morningBrief: string | null;
  summary: Record<string, number> | null;
  mode: string;
  finishedAt: string | null;
  trigger: string;
};

type Task = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  count: number | null;
  href: string | null;
  severity: string;
  confidence: number | null;
};

const MODE_HELP: Record<string, string> = {
  off: "AI foreslår produkter. Du importerer og publiserer.",
  semi: "AI importerer til kø. Du behandler og publiserer.",
  auto: "AI importerer + bygger produkt til Review. Du publiserer alltid.",
};

export default function AutonomyClient() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [runs, setRuns] = useState<
    Array<{ id: string; trigger: string; status: string; mode: string; startedAt: string }>
  >([]);
  const [memory, setMemory] = useState<{
    likes: string[];
    favoriteCategories: string[];
    brandProfile: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/autonomy");
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      setPolicy(data.policy);
      setBrief(data.brief);
      setTasks(data.tasks || []);
      setRuns(data.runs || []);
      setMemory(data.memory);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke laste");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savePolicy = async (next: Policy) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/autonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_policy", policy: next }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Lagring feilet");
      setPolicy(data.policy);
      toast.success("Policy lagret");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (light = false) => {
    setRunning(true);
    try {
      const res = await fetch("/api/admin/autonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", light }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Kjøring feilet");
      toast.success(
        light ? "Lett syklus fullført" : "Full autonomy-syklus fullført"
      );
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setRunning(false);
    }
  };

  if (loading || !policy) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-lg sm:p-8">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-300">
          <Bot size={14} /> Autonomous Commerce Engine
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          AI jobber — du styrer
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Orkestrerer Merchandiser, Store Intelligence, Import Queue, Pricing, SEO og
          Review. Aldri automatisk publisering.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={running}
            onClick={() => void runNow(false)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Kjør full syklus
          </button>
          <button
            type="button"
            disabled={running}
            onClick={() => void runNow(true)}
            className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            Lett syklus
          </button>
          <Link
            href="/admin/intelligence"
            className="inline-flex items-center gap-1 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Store Intelligence <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Mode */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Autonominivå</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(["off", "semi", "auto"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={saving}
              onClick={() => void savePolicy({ ...policy, mode: m })}
              className={`rounded-2xl border p-4 text-left transition ${
                policy.mode === m
                  ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <p className="text-sm font-bold uppercase tracking-wide text-slate-900">
                {m}
              </p>
              <p className="mt-1 text-xs text-slate-600">{MODE_HELP[m]}</p>
            </button>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={policy.scheduleEnabled}
            onChange={(e) =>
              void savePolicy({ ...policy, scheduleEnabled: e.target.checked })
            }
          />
          Planlagt kjøring (nattlig + timevis via Inngest)
        </label>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Shield size={16} /> Quality Gate
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["minImages", "Min. bilder"],
                ["minSpecs", "Min. specs"],
                ["minMarginPct", "Min. margin %"],
                ["minMerchandiserScore", "Min. merch-score"],
                ["minOverallConfidence", "Min. confidence"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm">
                <span className="font-medium text-slate-700">{label}</span>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                  value={policy.qualityGate[key]}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      qualityGate: {
                        ...policy.qualityGate,
                        [key]: Number(e.target.value),
                      },
                    })
                  }
                  onBlur={() => void savePolicy(policy)}
                />
              </label>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={policy.qualityGate.requireKnownCategory}
              onChange={(e) =>
                void savePolicy({
                  ...policy,
                  qualityGate: {
                    ...policy.qualityGate,
                    requireKnownCategory: e.target.checked,
                  },
                })
              }
            />
            Krev kjent butikkategori
          </label>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Store Goal</h3>
          <p className="mt-1 text-xs text-slate-500">
            Alle motorer optimaliserer mot dette (vekter 0–1).
          </p>
          <div className="mt-3 space-y-3">
            {(
              [
                ["quality", "Kvalitet"],
                ["margin", "Margin"],
                ["customerExperience", "Kundeopplevelse"],
                ["minimizeManual", "Minimere manuelt arbeid"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <div className="mb-1 flex justify-between">
                  <span className="font-medium text-slate-700">{label}</span>
                  <span className="text-slate-500">
                    {Math.round(policy.storeGoal[key] * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(policy.storeGoal[key] * 100)}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      storeGoal: {
                        ...policy.storeGoal,
                        [key]: Number(e.target.value) / 100,
                      },
                    })
                  }
                  onMouseUp={() => void savePolicy(policy)}
                  onTouchEnd={() => void savePolicy(policy)}
                  className="w-full"
                />
              </label>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <label>
              Max import/run
              <input
                type="number"
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={policy.maxImportsPerRun}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    maxImportsPerRun: Number(e.target.value),
                  })
                }
                onBlur={() => void savePolicy(policy)}
              />
            </label>
            <label>
              Min merch-score
              <input
                type="number"
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={policy.minMerchandiserScore}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    minMerchandiserScore: Number(e.target.value),
                  })
                }
                onBlur={() => void savePolicy(policy)}
              />
            </label>
          </div>
        </section>
      </div>

      {/* Brief */}
      {brief?.morningBrief && (
        <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Sparkles size={16} /> Siste morgenbrief
          </h3>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">
            {brief.morningBrief}
          </pre>
          <p className="mt-2 text-xs text-slate-500">
            {brief.trigger} · {brief.mode}
            {brief.finishedAt
              ? ` · ${new Date(brief.finishedAt).toLocaleString("no-NO")}`
              : ""}
          </p>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Åpne AI-oppgaver</h3>
          {tasks.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Ingen åpne oppgaver.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {tasks.slice(0, 8).map((t) => (
                <Link
                  key={t.id}
                  href={t.href || "/admin/dashboard"}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 hover:border-slate-300"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                    <p className="text-xs text-slate-600">{t.detail}</p>
                    {t.confidence != null ? (
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Confidence {Math.round(t.confidence)}%
                      </p>
                    ) : null}
                  </div>
                  {t.count != null ? (
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                      {t.count}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Store Memory</h3>
            <p className="mt-1 text-xs text-slate-500">
              Lært fra dine godkjenninger/avvisninger.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(memory?.likes || []).map((l) => (
                <span
                  key={l}
                  className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
                >
                  {l}
                </span>
              ))}
              {(memory?.favoriteCategories || []).map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                >
                  {c}
                </span>
              ))}
            </div>
            {memory?.brandProfile ? (
              <p className="mt-2 text-xs text-slate-600">{memory.brandProfile}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Siste kjøringer</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
              {runs.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <span>
                    {r.trigger} · {r.mode}
                  </span>
                  <span className="text-xs text-slate-500">
                    {r.status} · {new Date(r.startedAt).toLocaleString("no-NO")}
                  </span>
                </li>
              ))}
              {runs.length === 0 ? (
                <li className="text-slate-500">Ingen kjøringer ennå.</li>
              ) : null}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
