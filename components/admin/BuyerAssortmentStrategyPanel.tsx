"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Save, Target, Crosshair } from "lucide-react";
import { classifyAdminError } from "@/lib/admin/data-errors";

type FamilyRow = {
  familyId: string;
  label: string;
  have: number;
  target: number;
  softMax: number;
  hardMax: number;
  sharePct: number;
  enabled: boolean;
  fillRatio: number;
  health: "red" | "yellow" | "green" | "over";
  gap: number;
  missionWeight: number;
};

type CategoryRow = {
  category: string;
  have: number;
  target: number;
  fillPct: number;
  health: "red" | "yellow" | "green";
};

type Mission = {
  id: string;
  label: string;
  remaining: number;
};

type Dashboard = {
  updatedAt: string;
  totalActive: number;
  storeHealthPct: number;
  families: FamilyRow[];
  categories: CategoryRow[];
  mission: Mission;
  summary: {
    underfilled: number;
    onTrack: number;
    saturated: number;
    overSoft: number;
  };
};

const HEALTH: Record<FamilyRow["health"], string> = {
  green: "bg-emerald-100 text-emerald-800",
  yellow: "bg-amber-100 text-amber-900",
  red: "bg-rose-100 text-rose-800",
  over: "bg-slate-800 text-white",
};

const HEALTH_DOT: Record<FamilyRow["health"], string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-rose-500",
  over: "bg-slate-900",
};

const MISSIONS = [
  { id: "none", label: "Ingen oppdrag" },
  { id: "best_gaming", label: "Beste gamingbutikk" },
  { id: "komplett_like", label: "Komplett-lignende" },
  { id: "home_office", label: "Hjemmekontor (500)" },
] as const;

/**
 * Sortimentstrategi — butikkens behov (aldri bland med Lær AI-en).
 */
export function BuyerAssortmentStrategyPanel() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [draftShare, setDraftShare] = useState<Record<string, number>>({});
  const [draftEnabled, setDraftEnabled] = useState<Record<string, boolean>>({});
  const [missionId, setMissionId] = useState("none");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "red" | "yellow" | "green" | "over">(
    "all"
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/buyer?view=assortment");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      const d = data.dashboard as Dashboard;
      setDash(d);
      setMissionId(d.mission?.id || "none");
      const shares: Record<string, number> = {};
      const enabled: Record<string, boolean> = {};
      for (const f of d.families) {
        shares[f.familyId] = f.sharePct;
        enabled[f.familyId] = f.enabled;
      }
      setDraftShare(shares);
      setDraftEnabled(enabled);
    } catch (e: unknown) {
      toast.error(classifyAdminError(e).reason);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!dash) return [];
    return dash.families.filter(
      (f) => filter === "all" || f.health === filter
    );
  }, [dash, filter]);

  async function save() {
    if (!dash) return;
    setBusy(true);
    try {
      const targets = dash.families.map((f) => ({
        familyId: f.familyId,
        label: f.label,
        sharePct: draftShare[f.familyId] ?? f.sharePct,
        enabled: draftEnabled[f.familyId] ?? f.enabled,
        softMaxRatio: f.target > 0 ? f.softMax / f.target : 1.3,
        hardMaxRatio: f.target > 0 ? f.hardMax / f.target : 1.7,
      }));
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_assortment_strategy",
          targets,
          missionId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      toast.success("Sortimentstrategi lagret");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            Sortimentstrategi
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            Hva butikken mangler — skalerer med katalogen
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Mål = andel av publiserte produkter. Myk/hard grense demper
            overvekst. Oppdrag endrer vekting midlertidig — uten å blande med
            «Lær AI-en».
          </p>
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => void save()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Lagre strategi
        </button>
      </div>

      {loading || !dash ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-sky-600" />
        </div>
      ) : (
        <>
          {/* Store health */}
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                Butikkhelse {dash.storeHealthPct}%
              </p>
              <span className="text-xs text-slate-500">
                {dash.totalActive.toLocaleString("no-NO")} publiserte · mål
                skalerer automatisk
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-sky-600 transition-all"
                style={{ width: `${Math.min(100, dash.storeHealthPct)}%` }}
              />
            </div>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {dash.categories.map((c) => (
                <li
                  key={c.category}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs"
                >
                  <span className="font-medium text-slate-800">{c.category}</span>
                  <span
                    className={`tabular-nums font-semibold ${
                      c.health === "red"
                        ? "text-rose-700"
                        : c.health === "yellow"
                          ? "text-amber-700"
                          : "text-emerald-700"
                    }`}
                  >
                    {c.fillPct}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Mission */}
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
            <div className="min-w-[200px] flex-1">
              <label className="flex items-center gap-1 text-xs font-semibold text-sky-900">
                <Crosshair className="h-3.5 w-3.5" />
                Oppdrag
              </label>
              <select
                value={missionId}
                onChange={(e) => setMissionId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-900"
              >
                {MISSIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            {dash.mission?.id !== "none" && dash.mission.remaining > 0 && (
              <p className="text-sm text-sky-900">
                Aktivt: <strong>{dash.mission.label}</strong> ·{" "}
                {dash.mission.remaining} produkter igjen
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
              <Target className="h-3.5 w-3.5" />
              Dynamiske mål
            </span>
            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-800">
              {dash.summary.underfilled} underdekket
            </span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
              {dash.summary.onTrack} underveis
            </span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">
              {dash.summary.saturated} nær mål
            </span>
            <span className="rounded-full bg-slate-800 px-2.5 py-1 text-white">
              {dash.summary.overSoft} over myk grense
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(
              [
                ["all", "Alle"],
                ["red", "Mangler"],
                ["yellow", "Underveis"],
                ["green", "OK"],
                ["over", "Over grense"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  filter === id
                    ? "bg-sky-700 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <ul className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {rows.map((f) => {
              const share = draftShare[f.familyId] ?? f.sharePct;
              const enabled = draftEnabled[f.familyId] ?? f.enabled;
              return (
                <li
                  key={f.familyId}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${HEALTH_DOT[f.health]}`}
                  />
                  <div className="min-w-[140px] flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {f.label}
                      {f.missionWeight > 1.05 ? (
                        <span className="ml-1 text-[10px] font-bold text-sky-700">
                          ×{f.missionWeight.toFixed(1)}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs tabular-nums text-slate-500">
                      Har {f.have} · Mål {f.target} · Myk {f.softMax} · Hard{" "}
                      {f.hardMax}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${HEALTH[f.health]}`}
                  >
                    {f.have}/{f.target}
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    Andel %
                    <input
                      type="number"
                      min={0.1}
                      max={30}
                      step={0.1}
                      value={share}
                      onChange={(e) => {
                        const n = Math.max(
                          0.1,
                          Math.min(30, Number(e.target.value) || 0.1)
                        );
                        setDraftShare((prev) => ({
                          ...prev,
                          [f.familyId]: n,
                        }));
                      }}
                      className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold tabular-nums"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) =>
                        setDraftEnabled((prev) => ({
                          ...prev,
                          [f.familyId]: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-sky-600"
                    />
                    Aktiv
                  </label>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-xs text-slate-500">
            Eksempel: 8 % gamingmus av 420 = ~34 stk. Ved 6000 produkter blir
            målet automatisk større. Hard grense nesten ignorerer nye — med
            mindre kandidaten er eksepsjonell (≥92 % butikkmatch).
          </p>
        </>
      )}
    </section>
  );
}
