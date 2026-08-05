"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Loader2,
  Sparkles,
  Download,
  ThumbsUp,
  ThumbsDown,
  GitCompare,
  RefreshCw,
  Settings2,
  ArrowRight,
} from "lucide-react";
import { SupplierEngineTabs } from "@/components/admin/supplier/SupplierEngineTabs";
import { ScoreBar } from "@/components/admin/supplier/StatusBadge";

type Shelf = {
  id: string;
  label: string;
  description: string;
};

type Recommendation = {
  id: string;
  supplier: string;
  supplierProductId: string;
  title: string | null;
  imageUrl: string | null;
  supplierPrice: number | null;
  supplierCurrency: string | null;
  shelf: string;
  categoryHint: string | null;
  overallScore: number;
  scores: Record<string, number>;
  reasons: string[];
  risks: string[] | null;
  market: {
    buyerPersona?: string;
    summary?: string;
    impulseBuy?: boolean;
    giftPotential?: boolean;
  } | null;
  pricing: {
    estimatedRetailNOK?: number;
    estimatedMarginPct?: number;
    premiumPotential?: boolean;
    rationale?: string;
  } | null;
  visual: { summary?: string; aiAnalyzed?: boolean } | null;
  explanation: string | null;
  status: string;
};

const SCORE_LABELS: Record<string, string> = {
  visualQuality: "Visual",
  marketFit: "Market fit",
  marginPotential: "Margin",
  norwegianAudience: "Norsk publikum",
  competitionRisk: "Konkurranse",
  brandPotential: "Brand",
  imageQuality: "Bilder",
  specificationQuality: "Specs",
  categoryFit: "Kategori",
  shippingQuality: "Frakt/lager",
  variantQuality: "Varianter",
  seoPotential: "SEO",
};

export default function MerchandiserClient() {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [shelf, setShelf] = useState("today");
  const [items, setItems] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = useState<10 | 25 | 100>(25);
  const [compareResult, setCompareResult] = useState<{
    winnerTitle: string;
    why: string[];
  } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/merchandiser/recommendations?shelf=${shelf}&limit=60`
      );
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      setItems(data.items || []);
      if (data.shelves) setShelves(data.shelves);
      setSelected(new Set());
      setCompareResult(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke laste");
    } finally {
      setLoading(false);
    }
  }, [shelf]);

  useEffect(() => {
    void load();
  }, [load]);

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/admin/merchandiser/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetCount: batchSize,
          shelves:
            shelf === "today"
              ? undefined
              : [shelf],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Scan feilet");
      toast.success(data.message || "Anbefalinger klare");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Scan feilet");
    } finally {
      setScanning(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const queueSelected = async (ids?: string[]) => {
    const target = ids || Array.from(selected);
    if (target.length === 0) {
      toast.error("Velg minst ett produkt");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/merchandiser/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "queue", ids: target }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Import feilet");
      toast.success(
        (t) => (
          <span>
            {data.message}{" "}
            <a
              href="/admin/suppliers/import-queue"
              className="font-semibold underline"
              onClick={() => toast.dismiss(t.id)}
            >
              Åpne kø →
            </a>
          </span>
        ),
        { duration: 8000 }
      );
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id: string, decision: "accept" | "reject" | "dismiss") => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/merchandiser/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decide", id, decision }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      toast.success(decision === "accept" ? "Godkjent" : "Avvist");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  };

  const compare = async () => {
    if (selected.size < 2) {
      toast.error("Velg minst 2 produkter å sammenligne");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/merchandiser/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected).slice(0, 8) }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      setCompareResult({ winnerTitle: data.winnerTitle, why: data.why || [] });
      toast.success(`Anbefalt: ${data.winnerTitle}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  };

  const shelfTabs = useMemo(
    () =>
      shelves.length
        ? shelves
        : [
            { id: "today", label: "Anbefalt i dag", description: "" },
            { id: "gaming", label: "Gaming", description: "" },
            { id: "mobil", label: "Mobil", description: "" },
            { id: "kontor", label: "Kontor", description: "" },
            { id: "hjem", label: "Hjem", description: "" },
            { id: "elektronikk", label: "Elektronikk", description: "" },
            { id: "trending", label: "Trending", description: "" },
            { id: "new", label: "Nye produkter", description: "" },
          ],
    [shelves]
  );

  return (
    <div className="space-y-5">
      <SupplierEngineTabs />

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
              <Sparkles size={14} /> AI Merchandiser
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Jeg fant produktene som passer butikken din
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Digital innkjøper i Supplier Engine — analyserer, scorer og forklarer.
              Du tar alltid siste beslutning.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value) as 10 | 25 | 100)}
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
            >
              <option value={10} className="text-slate-900">
                10 produkter
              </option>
              <option value={25} className="text-slate-900">
                25 produkter
              </option>
              <option value={100} className="text-slate-900">
                100 produkter
              </option>
            </select>
            <button
              type="button"
              disabled={scanning}
              onClick={() => void runScan()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {scanning ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Finn anbefalinger
            </button>
            <Link
              href="/admin/suppliers/merchandiser/settings"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2.5 text-sm font-medium text-white hover:bg-white/10"
            >
              <Settings2 size={16} /> Profil
            </Link>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {shelfTabs.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setShelf(s.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              shelf === s.id
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 shadow-md">
          <span className="text-sm font-semibold text-emerald-950">
            {selected.size} valgt
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void queueSelected()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Download size={14} /> Legg i importkø
          </button>
          <button
            type="button"
            disabled={busy || selected.size < 2}
            onClick={() => void compare()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <GitCompare size={14} /> Sammenlign
          </button>
          <Link
            href="/admin/suppliers/import-queue"
            className="ml-auto text-sm font-semibold text-emerald-800 underline"
          >
            Importkø →
          </Link>
        </div>
      )}

      {compareResult && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <p className="text-sm font-semibold text-indigo-950">
            Anbefalt: {compareResult.winnerTitle}
          </p>
          <ul className="mt-1 list-inside list-disc text-sm text-indigo-900">
            {compareResult.why.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {loading || scanning ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white">
          <Loader2 className="animate-spin text-emerald-600" size={28} />
          <p className="text-sm text-slate-600">
            {scanning
              ? "Scanner leverandører og scorer produkter…"
              : "Laster anbefalinger…"}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Sparkles className="mx-auto text-slate-400" size={40} />
          <h3 className="mt-3 text-lg font-semibold text-slate-900">
            Ingen anbefalinger ennå
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Trykk «Finn anbefalinger» — systemet leter for deg.
          </p>
          <button
            type="button"
            disabled={scanning}
            onClick={() => void runScan()}
            className="mt-4 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Start scan
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const checked = selected.has(item.id);
            const open = expanded === item.id;
            const scoreDims = Object.entries(item.scores || {}).filter(
              ([k]) => k !== "overall"
            );
            return (
              <article
                key={item.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
                  checked
                    ? "border-emerald-400 ring-2 ring-emerald-100"
                    : "border-slate-200"
                }`}
              >
                <div className="relative aspect-[4/3] bg-slate-100">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-400">
                      Ingen bilde
                    </div>
                  )}
                  <label className="absolute left-3 top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-white/95 shadow">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(item.id)}
                      className="h-4 w-4"
                    />
                  </label>
                  <div className="absolute right-3 top-3 rounded-full bg-slate-950/90 px-2.5 py-1 text-sm font-bold text-white">
                    {Math.round(item.overallScore)}
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div>
                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">
                      {item.title || item.supplierProductId}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.supplier} · {item.categoryHint || item.shelf}
                      {item.supplierPrice != null
                        ? ` · ${item.supplierPrice} ${item.supplierCurrency || ""}`
                        : ""}
                    </p>
                  </div>

                  <ScoreBar score={item.overallScore} size="sm" />

                  <div className="flex flex-wrap gap-1.5">
                    {(item.reasons || []).slice(0, 4).map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
                      >
                        {r}
                      </span>
                    ))}
                    {item.pricing?.premiumPotential ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                        Premium
                      </span>
                    ) : null}
                    {item.pricing?.estimatedMarginPct != null ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        Margin ~{Math.round(item.pricing.estimatedMarginPct)}%
                      </span>
                    ) : null}
                  </div>

                  {item.explanation ? (
                    <p className="text-xs leading-relaxed text-slate-600">
                      {item.explanation}
                    </p>
                  ) : null}

                  {open && (
                    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-800">Score-detaljer</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {scoreDims.map(([k, v]) => (
                          <div
                            key={k}
                            className="flex items-center justify-between rounded-lg bg-white px-2 py-1 text-[11px]"
                          >
                            <span className="text-slate-600">
                              {SCORE_LABELS[k] || k}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {Math.round(Number(v))}
                            </span>
                          </div>
                        ))}
                      </div>
                      {item.market?.buyerPersona ? (
                        <p className="text-xs text-slate-600">
                          Kjøper: {item.market.buyerPersona}
                        </p>
                      ) : null}
                      {item.pricing?.estimatedRetailNOK != null ? (
                        <p className="text-xs text-slate-600">
                          Estimert utsalg: {item.pricing.estimatedRetailNOK} NOK
                        </p>
                      ) : null}
                      {(item.risks || []).length > 0 ? (
                        <p className="text-xs text-amber-800">
                          Risiko: {(item.risks || []).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void queueSelected([item.id])}
                      className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Importer
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(item.id, "accept")}
                      className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                      title="Godkjenn"
                    >
                      <ThumbsUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(item.id, "reject")}
                      className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                      title="Avvis"
                    >
                      <ThumbsDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : item.id)}
                      className="rounded-xl border border-slate-200 px-2 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {open ? "Skjul" : "Hvorfor"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <p>
          Neste steg etter import: Preview → Review → Publiser i{" "}
          <Link href="/admin/suppliers/import-queue" className="font-semibold text-emerald-700 underline">
            Importkø
          </Link>
        </p>
        <Link
          href="/admin/suppliers/merchandiser/settings"
          className="inline-flex items-center gap-1 font-semibold text-slate-800"
        >
          Butikkprofil <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
