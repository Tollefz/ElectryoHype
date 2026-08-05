"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Loader2,
  Plus,
  Save,
  Search,
  Crosshair,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { classifyAdminError } from "@/lib/admin/data-errors";
import {
  DEFAULT_HUNT_STRATEGY,
  starsToGlyphs,
} from "@/lib/buyer/product-focus-core";
import { useSmartPoll } from "@/lib/admin/useSmartPoll";

type FocusItem = {
  familyId: string;
  label: string;
  groupId: string;
  custom: boolean;
  tier: "core" | "supplementary";
};

type GroupCard = {
  id: string;
  label: string;
  shortLabel: string;
  emoji: string;
  stars: number;
  activeFamilies: number;
  core: FocusItem[];
  supplementary: FocusItem[];
  stats: {
    scanned: number;
    approved: number;
    published: number;
    hitRatePct: number;
  };
  identityPct: number;
  timeSharePct: number;
};

type Suggestion = {
  id: string;
  kind: string;
  familyId: string | null;
  label: string;
  message: string;
  proposedStars?: number;
};

type Protest = {
  id: string;
  familyId: string;
  label: string;
  message: string;
};

type Recommendation = {
  id: string;
  message: string;
  preferFamilies: Array<{ familyId: string; label: string }>;
};

type Dashboard = {
  updatedAt: string;
  groups: GroupCard[];
  starsByFamily: Record<string, number>;
  suggestions: Suggestion[];
  protests: Protest[];
  recommendations: Recommendation[];
  timeShare: Array<{ groupId: string; label: string; emoji: string; pct: number }>;
  identity: Array<{ groupId: string; label: string; emoji: string; pct: number }>;
  activeCount: number;
  huntLive: boolean;
  huntStrategy: string;
};

/**
 * Produktfokus kontrollsenter — jaktprioritet (ikke Lær AI / Sortiment).
 */
export function BuyerProductFocusPanel() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [huntStrategy, setHuntStrategy] = useState(DEFAULT_HUNT_STRATEGY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [customKeywords, setCustomKeywords] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/buyer?view=product_focus");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      const d = data.dashboard as Dashboard;
      setDash(d);
      if (!opts?.silent) {
        setHuntStrategy(d.huntStrategy || DEFAULT_HUNT_STRATEGY);
      }
      setDraft((prev) =>
        opts?.silent ? { ...d.starsByFamily, ...prev } : { ...d.starsByFamily }
      );
    } catch (e: unknown) {
      if (!opts?.silent) toast.error(classifyAdminError(e).reason);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pollSilent = useCallback(() => load({ silent: true }), [load]);
  useSmartPoll({
    tick: pollSilent,
    active: Boolean(dash?.huntLive),
    activeMs: 8_000,
    idleMs: 45_000,
    enabled: true,
  });

  function setStars(familyId: string, stars: number) {
    setDraft((prev) => ({ ...prev, [familyId]: stars }));
  }

  function toggle(familyId: string) {
    const cur = draft[familyId] ?? 0;
    setStars(familyId, cur > 0 ? 0 : 3);
  }

  function applyDash(d: Dashboard) {
    setDash(d);
    setDraft({ ...d.starsByFamily });
    setHuntStrategy(d.huntStrategy || DEFAULT_HUNT_STRATEGY);
  }

  async function save() {
    setBusy(true);
    try {
      const entries = Object.entries(draft).map(([familyId, stars]) => ({
        familyId,
        stars,
      }));
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_product_focus",
          entries,
          huntStrategy,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      toast.success("Produktfokus lagret");
      applyDash(data.dashboard as Dashboard);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  }

  async function postFocus(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_product_focus", ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      applyDash(data.dashboard as Dashboard);
      return true;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addCustom() {
    const label = customLabel.trim();
    if (!label) {
      toast.error("Skriv inn et navn");
      return;
    }
    const keywords = customKeywords
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const ok = await postFocus({
      addCustom: {
        label,
        keywords: keywords.length ? keywords : [label],
        stars: 3,
        groupId: openGroup || "maker",
      },
    });
    if (ok) {
      toast.success(`Lagt til: ${label}`);
      setCustomLabel("");
      setCustomKeywords("");
      setShowCustom(false);
    }
  }

  const filteredItems = useMemo(() => {
    if (!dash || !openGroup) return { core: [] as FocusItem[], supp: [] as FocusItem[] };
    const g = dash.groups.find((x) => x.id === openGroup);
    if (!g) return { core: [], supp: [] };
    const needle = q.trim().toLowerCase();
    const filter = (items: FocusItem[]) =>
      !needle
        ? items
        : items.filter(
            (i) =>
              i.label.toLowerCase().includes(needle) ||
              i.familyId.toLowerCase().includes(needle)
          );
    return { core: filter(g.core), supp: filter(g.supplementary) };
  }, [dash, openGroup, q]);

  function renderFamilyChip(item: FocusItem) {
    const stars = draft[item.familyId] ?? 0;
    const on = stars > 0;
    return (
      <li
        key={item.familyId}
        className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm ${
          on ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-slate-50"
        }`}
      >
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={on}
            onChange={() => toggle(item.familyId)}
            className="rounded border-slate-300 text-violet-600"
          />
          <span className={`font-medium ${on ? "text-violet-950" : "text-slate-600"}`}>
            {item.label}
            {item.custom ? (
              <span className="ml-1 text-[10px] text-violet-600">egendefinert</span>
            ) : null}
          </span>
        </label>
        {on && (
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setStars(item.familyId, n)}
                className={`text-sm leading-none ${
                  n <= stars ? "text-amber-500" : "text-slate-300"
                }`}
              >
                ★
              </button>
            ))}
          </div>
        )}
      </li>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            Produktfokus
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            Kontrollsenter for AI-produktjakten
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Hva AI skal bruke mest tid på å finne. Kjerne definerer butikken —
            supplerende fyller hull uten å dominere. Aldri blandet med «Lær
            AI-en» eller Sortimentstrategi.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => void save()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Lagre fokusfokus
        </button>
      </div>

      {loading || !dash ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
        </div>
      ) : (
        <>
          {/* Produktjakt-strategi — own field under Produktfokus */}
          <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
            <p className="text-sm font-semibold text-violet-950">
              Produktjakt-strategi
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Disse reglene styrer hvordan AI velger neste produkt under jakten.
              Dette påvirker bare produktjakten og endrer ikke butikkregler
              eller sortimentsmål.
            </p>
            <textarea
              value={huntStrategy}
              onChange={(e) => setHuntStrategy(e.target.value)}
              rows={12}
              className="mt-3 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400"
              placeholder={DEFAULT_HUNT_STRATEGY}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setHuntStrategy(DEFAULT_HUNT_STRATEGY)}
                className="rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-900"
              >
                Tilbakestill til standard
              </button>
              <span className="text-[11px] text-slate-500">
                Kode: familie først → beste produkt i familien → jakt-fatigue
                (nullstilles ved neste jakt)
              </span>
            </div>
          </div>

          {/* Store identity */}
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Butikkidentitet</p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {dash.identity.map((row) => (
                <li
                  key={row.groupId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs"
                >
                  <span className="font-medium text-slate-800">
                    {row.emoji} {row.label}
                  </span>
                  <span className="tabular-nums font-semibold text-violet-800">
                    {row.pct}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Time share */}
          <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-violet-950">
                AI bruker mest tid på
              </p>
              {dash.huntLive ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  LIVE
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-violet-700">
                  Planlagt fra fokus
                </span>
              )}
            </div>
            <ul className="mt-3 space-y-2">
              {dash.timeShare.map((row) => (
                <li key={row.groupId} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 font-medium text-slate-800">
                    {row.emoji} {row.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-violet-600 transition-all"
                      style={{ width: `${Math.min(100, row.pct)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs font-semibold tabular-nums text-violet-900">
                    {row.pct}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Protests */}
          {dash.protests.length > 0 && (
            <ul className="mt-4 space-y-2">
              {dash.protests.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
                >
                  <p>{p.message}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await postFocus({
                          reduceFocus: { familyId: p.familyId },
                        });
                        if (ok) toast.success("Fokus redusert");
                      }}
                      className="rounded-lg bg-violet-700 px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      Godta
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        await postFocus({ dismissSuggestion: p.id });
                      }}
                      className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold"
                    >
                      Ignorer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Suggestions */}
          {dash.suggestions.length > 0 && (
            <ul className="mt-4 space-y-2">
              {dash.suggestions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950"
                >
                  <p>{s.message}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (s.kind === "reduce_focus" && s.familyId) {
                          await postFocus({
                            reduceFocus: {
                              familyId: s.familyId,
                              stars: s.proposedStars,
                            },
                          });
                        } else if (s.familyId) {
                          await postFocus({ acceptSuggestion: s.familyId });
                        }
                        toast.success("Oppdatert");
                      }}
                      className="rounded-lg bg-violet-700 px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      Ja
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void postFocus({ dismissSuggestion: s.id })}
                      className="rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-xs font-semibold"
                    >
                      Nei
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* AI recommendations */}
          {dash.recommendations.length > 0 && (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <p className="text-sm font-semibold text-emerald-950">AI anbefaler</p>
              {dash.recommendations.map((r) => (
                <div key={r.id} className="mt-2">
                  <p className="text-sm text-emerald-900">{r.message}</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.preferFamilies.map((f) => (
                      <li
                        key={f.familyId}
                        className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-emerald-900"
                      >
                        {f.label}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-emerald-800/80">
                    Kun anbefaling — du bestemmer.
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Group cards */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-900">
              <Crosshair className="h-3.5 w-3.5" />
              {Object.values(draft).filter((s) => s > 0).length} aktive familier
            </span>
            <button
              type="button"
              onClick={() => setShowCustom((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Ny produktfamilie
            </button>
          </div>

          {showCustom && (
            <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
              <div className="flex flex-wrap gap-2">
                <input
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="F.eks. NAS, Retro Gaming"
                  className="min-w-[160px] flex-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-sm"
                />
                <input
                  value={customKeywords}
                  onChange={(e) => setCustomKeywords(e.target.value)}
                  placeholder="Nøkkelord (komma)"
                  className="min-w-[160px] flex-1 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addCustom()}
                  className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Legg til
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dash.groups.map((g) => {
              const open = openGroup === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setOpenGroup(open ? null : g.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    open
                      ? "border-violet-400 bg-violet-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-violet-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-2xl leading-none">{g.emoji}</p>
                      <p className="mt-2 text-sm font-bold text-slate-900">
                        {g.label}
                      </p>
                      <p className="mt-0.5 text-amber-500">
                        {starsToGlyphs(g.stars)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {g.activeFamilies} aktive familier
                      </p>
                    </div>
                    {open ? (
                      <ChevronUp className="h-4 w-4 text-violet-600" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-600">
                    <div>
                      <dt className="text-slate-400">Scannet</dt>
                      <dd className="font-semibold tabular-nums">
                        {g.stats.scanned}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Godkjente</dt>
                      <dd className="font-semibold tabular-nums">
                        {g.stats.approved}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Publisert</dt>
                      <dd className="font-semibold tabular-nums">
                        {g.stats.published}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Treffsikkerhet</dt>
                      <dd className="font-semibold tabular-nums">
                        {g.stats.hitRatePct}%
                      </dd>
                    </div>
                  </dl>
                </button>
              );
            })}
          </div>

          {/* Expanded group detail */}
          {openGroup && (
            <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Søk etter produktfamilie..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"
                  />
                </div>
              </div>

              <h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-violet-900">
                Kjerneprodukter
              </h4>
              <p className="text-[11px] text-slate-600">
                Definerer ElectroHypeX — høyest prioritet i jakten.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {filteredItems.core.map(renderFamilyChip)}
                {filteredItems.core.length === 0 && (
                  <li className="text-xs text-slate-500">Ingen treff</li>
                )}
              </ul>

              <h4 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-700">
                Supplerende produkter
              </h4>
              <p className="text-[11px] text-slate-600">
                Hjelper sortimentet — skal aldri dominere.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {filteredItems.supp.map(renderFamilyChip)}
                {filteredItems.supp.length === 0 && (
                  <li className="text-xs text-slate-500">Ingen treff</li>
                )}
              </ul>
            </div>
          )}

          <p className="mt-3 text-xs text-slate-500">
            Merch score = butikkmatch + sortiment + produktfokus + margin +
            levering + kvalitet (+ konkurranse). Produktfokus løfter aldri et
            dårlig produkt alene.
          </p>
        </>
      )}
    </section>
  );
}
