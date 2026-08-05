"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, Loader2, Package } from "lucide-react";
import {
  buildBuyerBoard,
  type DeskBuyerCandidate,
  type DeskBuyerCandidateCard,
  type BuyerProductPackage,
  type BuyerSmartGroup,
} from "@/lib/ops/desk-buyer-groups";
import {
  BuyerProductCard,
  DENSITY_GRID,
  type BuyerCardDensity,
} from "@/components/admin/BuyerProductCard";

const REVIEW_KEY = "ehx:buyer:reviewedIds";
const SINCE_KEY = "ehx:buyer:lastReviewPass";

function readReviewed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeReviewed(ids: Set<string>) {
  try {
    localStorage.setItem(REVIEW_KEY, JSON.stringify([...ids].slice(-2000)));
  } catch {
    /* ignore */
  }
}

function readSince(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SINCE_KEY);
  } catch {
    return null;
  }
}

type Props = {
  candidates?: DeskBuyerCandidate[] | null;
  /** @deprecated prefer candidates */
  groups?: unknown;
  scanStatus?: string | null;
  /** Show fewer sections on Desk */
  compact?: boolean;
};

function Grid({
  cards,
  density,
  busy,
  reviewed,
  onImport,
  onReviewed,
}: {
  cards: DeskBuyerCandidateCard[];
  density: BuyerCardDensity;
  busy: boolean;
  reviewed: Set<string>;
  onImport: (id: string) => void;
  onReviewed: (id: string) => void;
}) {
  if (!cards.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
        Ingen produkter i denne gruppen.
      </p>
    );
  }
  return (
    <ul className={DENSITY_GRID[density]}>
      {cards.map((c) => (
        <BuyerProductCard
          key={c.id}
          card={c}
          density={density}
          busy={busy}
          reviewed={reviewed.has(c.id)}
          onImport={onImport}
          onReviewed={onReviewed}
          onSkip={onReviewed}
        />
      ))}
    </ul>
  );
}

function PackageCard({
  pkg,
  busy,
  onImport,
}: {
  pkg: BuyerProductPackage;
  busy: boolean;
  onImport: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <p className="text-sm font-semibold text-slate-900">
            <span className="mr-1.5" aria-hidden>
              {pkg.emoji}
            </span>
            {pkg.title}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">{pkg.subtitle}</p>
          <p className="mt-2 text-xs text-slate-600">
            {pkg.productCount} produkter · snitt match {pkg.avgMatch}%
            {pkg.avgMargin != null ? ` · snitt margin ${pkg.avgMargin}%` : ""} · dekning{" "}
            {pkg.coveragePct}%
          </p>
        </button>
        <button
          type="button"
          disabled={busy || pkg.importIds.length === 0}
          onClick={() => onImport(pkg.importIds)}
          className="inline-flex items-center gap-1 rounded-xl bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Package className="h-3.5 w-3.5" />
          Importer hele pakken
        </button>
      </div>
      {open && (
        <ul className="mt-3 grid gap-1 border-t border-violet-100 pt-3 text-xs text-slate-700 sm:grid-cols-2">
          {pkg.slots.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className={s.filled ? "text-emerald-600" : "text-slate-400"}>
                {s.filled ? "✔" : "○"}
              </span>
              <span className="font-medium">{s.label}</span>
              {s.card && (
                <span className="truncate text-slate-500">— {s.card.title}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="mt-2 text-[11px] font-semibold text-violet-800"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Skjul slots" : "Vis dekning"}{" "}
        <ChevronDown className={`inline h-3 w-3 ${open ? "rotate-180" : ""}`} />
      </button>
    </li>
  );
}

/**
 * Digital Buyer UX V3 — fast procurement board.
 * Polls ranking while a mission runs so Robin sees new candidates without refresh.
 */
export function DeskBuyerCategories({ candidates, scanStatus, compact }: Props) {
  const [density, setDensity] = useState<BuyerCardDensity>("standard");
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [sinceIso, setSinceIso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>("new");
  const [liveCandidates, setLiveCandidates] = useState<DeskBuyerCandidate[] | null>(
    candidates || null
  );
  const [liveScanStatus, setLiveScanStatus] = useState<string | null>(scanStatus || null);

  useEffect(() => {
    setReviewed(readReviewed());
    setSinceIso(readSince());
  }, []);

  useEffect(() => {
    setLiveCandidates(candidates || null);
  }, [candidates]);

  useEffect(() => {
    setLiveScanStatus(scanStatus || null);
  }, [scanStatus]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      try {
        const res = await fetch("/api/admin/buyer?poll=1");
        const data = await res.json();
        if (cancelled || !res.ok || !data?.ok) return;
        if (Array.isArray(data.ranking)) {
          setLiveCandidates(data.ranking as DeskBuyerCandidate[]);
        }
        if (data.scan?.status) setLiveScanStatus(String(data.scan.status));
      } catch {
        /* keep last */
      }
    }
    void tick();
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    // Only poll while a scan is live; otherwise 60s idle refresh
    const t = setInterval(() => void tick(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const board = useMemo(
    () =>
      buildBuyerBoard(liveCandidates || [], {
        reviewedIds: reviewed,
        sinceIso,
      }),
    [liveCandidates, reviewed, sinceIso]
  );

  const markReviewed = useCallback((id: string) => {
    setReviewed((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeReviewed(next);
      return next;
    });
  }, []);

  const markAllNewReviewed = useCallback(() => {
    setReviewed((prev) => {
      const next = new Set(prev);
      for (const c of board.newSuggestions) next.add(c.id);
      writeReviewed(next);
      try {
        localStorage.setItem(SINCE_KEY, new Date().toISOString());
        setSinceIso(new Date().toISOString());
      } catch {
        /* ignore */
      }
      return next;
    });
    toast.success("Nye forslag markert som gjennomgått");
  }, [board.newSuggestions]);

  async function importIds(ids: string[]) {
    const list = Array.from(new Set(ids.filter(Boolean)));
    if (!list.length) {
      toast.error("Ingen importerbare kandidater");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_ids", ids: list }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Import feilet");
      toast.success(`Importerte ${data.imported ?? list.length} til kø`);
      for (const id of list) markReviewed(id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  }

  if (!liveCandidates?.length) {
    return (
      <section
        id="desk-buyer"
        className="rounded-2xl border border-dashed border-emerald-200 bg-white/80 p-5"
      >
        <h2 className="text-base font-semibold text-slate-900">Digital Buyer</h2>
        <p className="mt-1 text-sm text-slate-600">
          AI forbereder forslag i grid — du vurderer raskt, jeg har allerede filtrert.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {liveScanStatus === "running" || liveScanStatus === "queued"
            ? "Scan kjører. Nye forslag dukker opp her automatisk."
            : "Ingen rangerte kandidater ennå. Start et kategorioppdrag over."}
        </p>
      </section>
    );
  }

  const densityBtns: Array<{ id: BuyerCardDensity; label: string }> = [
    { id: "compact", label: "Kompakt" },
    { id: "standard", label: "Standard" },
    { id: "large", label: "Stor" },
  ];

  return (
    <section id="desk-buyer" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Digital Buyer — innkjøpsflate
          </h2>
          <p className="text-sm text-slate-600">
            Vurder 50–100 forslag på få minutter. AI har allerede gjort grovarbeidet.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {densityBtns.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDensity(d.id)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                density === d.id
                  ? "border-emerald-600 bg-emerald-700 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product packages */}
      {!compact && board.packages.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Produktpakker</h3>
          <ul className="grid gap-3 lg:grid-cols-2">
            {board.packages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                busy={busy}
                onImport={(ids) => void importIds(ids)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* New suggestions */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-amber-950">Nye forslag</h3>
            <p className="text-xs text-amber-900/80">
              Funnet siden forrige gjennomgang — {board.newSuggestions.length} stk.
            </p>
          </div>
          {board.newSuggestions.length > 0 && (
            <button
              type="button"
              onClick={markAllNewReviewed}
              className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-950"
            >
              Merk alle som sett
            </button>
          )}
        </div>
        <Grid
          cards={board.newSuggestions.slice(0, compact ? 10 : 40)}
          density={density}
          busy={busy}
          reviewed={reviewed}
          onImport={(id) => void importIds([id])}
          onReviewed={markReviewed}
        />
      </div>

      {/* Smart groups */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Smart gruppering</h3>
        <p className="mb-3 text-xs text-slate-500">
          AI viser bare grupper som er relevante nå.
        </p>
        <ul className="space-y-2">
          {board.smartGroups
            .filter((g) => g.id !== "new")
            .slice(0, compact ? 4 : 10)
            .map((g: BuyerSmartGroup) => {
              const open = openGroup === g.id;
              return (
                <li
                  key={g.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setOpenGroup(open ? null : g.id)}
                  >
                    <span className="text-xl" aria-hidden>
                      {g.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-900">{g.label}</span>
                      <span className="text-xs text-slate-500">{g.count} forslag</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                  {open && (
                    <div className="border-t border-slate-100 bg-slate-50/40 p-3">
                      <div className="mb-2 flex justify-end">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void importIds(
                              g.candidates.filter((c) => c.canImport).map((c) => c.id)
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Importer synlige
                        </button>
                      </div>
                      <Grid
                        cards={g.candidates.slice(0, compact ? 8 : 25)}
                        density={density}
                        busy={busy}
                        reviewed={reviewed}
                        onImport={(id) => void importIds([id])}
                        onReviewed={markReviewed}
                      />
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
      </div>
    </section>
  );
}
