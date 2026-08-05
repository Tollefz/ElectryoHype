"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  MoreVertical,
  Play,
  RefreshCw,
  Search,
  RotateCcw,
} from "lucide-react";
import { BuyerPublishLivePanel } from "@/components/admin/BuyerPublishLivePanel";
import { BuyerPublishMonitor } from "@/components/admin/BuyerPublishMonitor";
import type { BuyerPublishJobSnapshot } from "@/lib/buyer/publish-job-types";

type RepublishGateReason =
  | "ready"
  | "pricing_missing"
  | "freight_gate"
  | "margin_gate"
  | "price_drift"
  | "econ_confidence"
  | "missing_media"
  | "missing_import_link"
  | "assortment"
  | "extreme_margin"
  | "variant"
  | "already_published"
  | "supplier_invalid"
  | "other";

type RepublishStatus =
  | "ready"
  | "fail_margin"
  | "fail_freight"
  | "fail_pricing"
  | "fail_quality"
  | "published";

type RepublishRow = {
  id: string;
  title: string;
  imageUrl: string | null;
  supplier: string;
  supplierProductId: string;
  category: string;
  group: string;
  landedCostNOK: number | null;
  retailNOK: number | null;
  marginPct: number | null;
  status: RepublishStatus;
  statusLabel: string;
  gateReason?: RepublishGateReason;
  gateReasonLabel?: string;
  gateProblems?: string[];
  updatedAt: string;
};

type Summary = {
  ready: number;
  failGate: number;
  published: number;
  total: number;
  failPricing: number;
  failMargin: number;
  failFreight: number;
  failQuality: number;
  pricingOk: number;
  scopedToPublishJob: boolean;
  gateReasons?: Record<RepublishGateReason, number>;
};

type TabId = "ready" | "fail_gate";

const GATE_REASON_ORDER: { key: RepublishGateReason; label: string }[] = [
  { key: "freight_gate", label: "Freight gate" },
  { key: "pricing_missing", label: "Pricing mangler" },
  { key: "supplier_invalid", label: "Ugyldig leverandørpris" },
  { key: "margin_gate", label: "Margin gate" },
  { key: "extreme_margin", label: "Ekstrem margin" },
  { key: "econ_confidence", label: "Økonomisk sikkerhet" },
  { key: "price_drift", label: "Price drift" },
  { key: "missing_media", label: "Media" },
  { key: "missing_import_link", label: "Importkobling" },
  { key: "assortment", label: "Sortiment" },
  { key: "variant", label: "Variant" },
  { key: "other", label: "Annet" },
];

function fmtNok(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("no-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} kr`;
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n * 10) / 10}%`;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("no-NO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return fmtTime(iso);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "nå";
  if (min < 60) return `${min} min siden`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} t siden`;
  return fmtTime(iso);
}

function estimateEtaRange(count: number): string {
  if (count <= 0) return "—";
  const low = Math.max(1, Math.round(count / 70));
  const high = Math.max(low, Math.round(count / 50));
  if (low === high) return `${low} min`;
  return `${low}–${high} min`;
}

function pageWindow(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages - 1) pages.push("…");
  pages.push(totalPages);
  return pages;
}

function supplierLabel(s: string): string {
  if (s.toLowerCase() === "cj") return "CJ Dropshipping";
  return s;
}

/**
 * Publiser kandidater på nytt — mockup-aligned arbeidsflate på Produktkjøper.
 * Gjenbruker buyer_republish_job + Publish Monitor / Quality Gate.
 */
export function BuyerRepublishSection() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<RepublishRow[]>([]);
  const [readyIds, setReadyIds] = useState<string[]>([]);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [filterOptions, setFilterOptions] = useState<{
    groups: string[];
    categories: string[];
    suppliers: string[];
  }>({ groups: [], categories: [], suppliers: [] });
  const [job, setJob] = useState<BuyerPublishJobSnapshot | null>(null);
  const [workerStatus, setWorkerStatus] = useState<string | null>(null);
  const [workerHeartbeat, setWorkerHeartbeat] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>("ready");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [group, setGroup] = useState("all");
  const [category, setCategory] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [showFailAnalysis, setShowFailAnalysis] = useState(false);
  const [failDiagRows, setFailDiagRows] = useState<RepublishRow[]>([]);
  const [failDiagLoading, setFailDiagLoading] = useState(false);
  const [diagGateFilter, setDiagGateFilter] = useState<RepublishGateReason | "all">("all");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [tab, debouncedQ, group, category, supplier, statusFilter, pageSize]);

  const boardStatus = useMemo(() => {
    if (tab === "fail_gate") {
      if (statusFilter === "fail_margin") return "fail_margin";
      if (statusFilter === "fail_freight") return "fail_freight";
      if (statusFilter === "fail_pricing") return "fail_pricing";
      if (statusFilter === "fail_quality") return "fail_quality";
      return "fail_gate";
    }
    if (statusFilter === "published") return "published";
    if (statusFilter === "ready") return "ready";
    return tab;
  }, [tab, statusFilter]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("view", "republish_board");
      params.set("status", boardStatus);
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));
      if (debouncedQ) params.set("q", debouncedQ);
      if (group !== "all") params.set("group", group);
      if (category !== "all") params.set("category", category);
      if (supplier !== "all") params.set("supplier", supplier);

      const res = await fetch(`/api/admin/buyer?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!data?.ok) {
        throw new Error(data?.error || "Kunne ikke hente republish-board");
      }
      setSummary(data.summary);
      setRows(data.rows || []);
      setReadyIds(data.readyIds || []);
      setFilteredTotal(Number(data.filteredTotal || 0));
      setFilterOptions(
        data.filterOptions || { groups: [], categories: [], suppliers: [] }
      );
      setJob(data.job || null);
      setWorkerStatus(data.workerStatus || null);
      setWorkerHeartbeat(data.workerHeartbeat || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil ved lasting");
    } finally {
      setLoading(false);
    }
  }, [
    boardStatus,
    page,
    pageSize,
    debouncedQ,
    group,
    category,
    supplier,
  ]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (job?.status !== "running") return;
    const t = setInterval(() => {
      void fetch(`/api/admin/buyer?view=publish_job&kind=republish`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.ok) {
            setJob(data.job || null);
            setWorkerStatus(data.workerStatus || null);
            setWorkerHeartbeat(data.workerHeartbeat || null);
          }
        })
        .catch(() => undefined);
    }, 2500);
    return () => clearInterval(t);
  }, [job?.status]);

  /** Load fail diagnostics list when panel opens or gate filter changes. */
  useEffect(() => {
    if (!showFailAnalysis) return;
    let cancelled = false;
    setFailDiagLoading(true);
    const params = new URLSearchParams();
    params.set("view", "republish_board");
    params.set("status", "fail_gate");
    params.set("limit", "100");
    params.set("offset", "0");
    if (diagGateFilter !== "all") params.set("gateReason", diagGateFilter);
    void fetch(`/api/admin/buyer?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.ok) return;
        setFailDiagRows(data.rows || []);
        if (data.summary) setSummary(data.summary);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setFailDiagLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showFailAnalysis, diagGateFilter]);

  const failDistribution = useMemo(() => {
    const gr = summary?.gateReasons;
    if (!gr) return [];
    return GATE_REASON_ORDER.map((item) => ({
      ...item,
      count: Number(gr[item.key] || 0),
    })).filter((x) => x.count > 0);
  }, [summary?.gateReasons]);

  const failDistributionSum = useMemo(
    () => failDistribution.reduce((a, b) => a + b.count, 0),
    [failDistribution]
  );

  const selectedCount =
    selected.size > 0 ? selected.size : summary?.ready || 0;

  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const rangeStart = filteredTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(filteredTotal, page * pageSize);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllReady = () => {
    setSelected(new Set(readyIds));
    toast.success(
      `Valgte ${readyIds.length.toLocaleString("no-NO")} klare kandidater`
    );
  };

  const fillPricing = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fill_republish_pricing",
          limit: 3000,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) throw new Error(data?.error || "Pricing-fyll feilet");
      toast.success(data.message || "Pricing oppdatert");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  };

  const startRepublish = async () => {
    setBusy(true);
    try {
      const ids = selected.size > 0 ? Array.from(selected) : undefined;
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_republish_job",
          ids,
          fillMissingPricing: true,
          batchSize: 25,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) throw new Error(data?.error || "Kunne ikke starte");
      setJob(data.job);
      toast.success(data.message || "Republisering startet");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setResumeBusy(true);
    try {
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume_republish_job" }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) throw new Error(data?.error || "Resume feilet");
      setJob(data.job);
      toast.success("Fortsetter republisering");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setResumeBusy(false);
    }
  };

  const dismiss = async () => {
    await fetch("/api/admin/buyer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss_republish_job" }),
    });
    setJob(null);
    await load();
  };

  const scrollToHunt = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section
      id="republiser-kandidater"
      className="scroll-mt-4 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            AI-produktjakt
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Publiser kandidater på nytt
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
            Reparerte kandidater er klare til å publiseres på nytt. Vi bruker
            oppdatert pricing og kjører dem gjennom Quality Gate før
            publisering.
          </p>
        </div>
        <button
          type="button"
          onClick={scrollToHunt}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Tilbake til produktjakt
        </button>
      </div>

      {/* Summary cards */}
      {summary ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            iconBg="bg-emerald-50"
            value={summary.ready}
            title="Reparert og klar"
            subtitle="Kandidater klare for republisering"
            active={tab === "ready"}
            onClick={() => setTab("ready")}
          />
          <SummaryCard
            icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
            iconBg="bg-amber-50"
            value={summary.failGate}
            title="Kan ikke publiseres"
            subtitle="Feiler fortsatt Quality Gate"
            active={tab === "fail_gate"}
            onClick={() => setTab("fail_gate")}
          />
          <SummaryCard
            icon={<RotateCcw className="h-5 w-5 text-sky-600" />}
            iconBg="bg-sky-50"
            value={summary.published}
            title="Publisert tidligere"
            subtitle="Allerede publisert"
          />
          <SummaryCard
            icon={<Database className="h-5 w-5 text-violet-600" />}
            iconBg="bg-violet-50"
            value={summary.total}
            title="Totalt kandidater"
            subtitle={
              summary.scopedToPublishJob
                ? "Totalt i denne runden"
                : "Totalt i utvalget"
            }
          />
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-slate-100 bg-slate-50"
            />
          ))}
        </div>
      ) : null}

      {/* Pricing repaired alert */}
      {summary && summary.pricingOk > 0 ? (
        <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3.5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-950">
              Pricing er reparert
            </p>
            <p className="mt-0.5 text-sm text-emerald-900/90">
              {summary.pricingOk.toLocaleString("no-NO")} kandidater har
              costNOK/landedCost/retail.{" "}
              {summary.ready.toLocaleString("no-NO")} er klare for
              republisering etter Quality Gate.
            </p>
          </div>
        </div>
      ) : summary && summary.failPricing > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3.5">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-950">
                Pricing mangler fortsatt
              </p>
              <p className="mt-0.5 text-sm text-amber-900/90">
                {summary.failPricing.toLocaleString("no-NO")} kandidater mangler
                costNOK/landedCost. Fyll pricing uten ny produktjakt.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void fillPricing()}
            className="rounded-xl bg-amber-800 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-900 disabled:opacity-50"
          >
            Fyll manglende pricing
          </button>
        </div>
      ) : null}

      {/* Live job monitor */}
      {job && (job.status === "running" || job.status === "error") ? (
        <BuyerPublishLivePanel
          job={job}
          workerStatus={workerStatus}
          workerHeartbeat={workerHeartbeat}
          onDismiss={() => void dismiss()}
          onResume={() => void resume()}
          resumeBusy={resumeBusy}
        />
      ) : job?.status === "done" ? (
        <BuyerPublishMonitor
          job={job}
          workerStatus={workerStatus}
          workerHeartbeat={workerHeartbeat}
          onResume={() => void resume()}
          resumeBusy={resumeBusy}
        />
      ) : null}

      {/* Tabs */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200">
        <div className="flex gap-1">
          <TabButton
            active={tab === "ready"}
            onClick={() => setTab("ready")}
            label={`Klar for republisering (${(summary?.ready || 0).toLocaleString("no-NO")})`}
          />
          <TabButton
            active={tab === "fail_gate"}
            onClick={() => setTab("fail_gate")}
            label={`Kan ikke publiseres (${(summary?.failGate || 0).toLocaleString("no-NO")})`}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFailAnalysis((v) => !v)}
          className="mb-2 text-sm font-semibold text-rose-700 hover:underline"
        >
          Se analyse av feil
        </button>
      </div>

      {showFailAnalysis && summary ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-4 text-sm text-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-slate-900">
                Diagnostikk — Kan ikke publiseres
              </p>
              <p className="mt-1 text-slate-600">
                Oppsummering:{" "}
                <strong className="tabular-nums text-slate-900">
                  {summary.failGate.toLocaleString("no-NO")}
                </strong>{" "}
                kandidater
                {failDistributionSum > 0 &&
                failDistributionSum !== summary.failGate
                  ? ` (fordeling summerer ${failDistributionSum.toLocaleString("no-NO")})`
                  : null}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowFailAnalysis(false);
                setDiagGateFilter("all");
              }}
              className="text-sm font-semibold text-rose-800 hover:underline"
            >
              Lukk
            </button>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Fordeling
            </p>
            {failDistribution.length === 0 ? (
              <p className="mt-2 text-slate-500">
                Ingen gate-årsaker i summary ennå — oppdater board.
              </p>
            ) : (
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {failDistribution.map((d) => (
                  <li key={d.key}>
                    <button
                      type="button"
                      onClick={() =>
                        setDiagGateFilter((prev) =>
                          prev === d.key ? "all" : d.key
                        )
                      }
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                        diagGateFilter === d.key
                          ? "border-rose-400 bg-white shadow-sm"
                          : "border-transparent bg-white/70 hover:border-rose-200"
                      }`}
                    >
                      <span className="font-medium text-slate-800">
                        {d.label}
                      </span>
                      <strong className="tabular-nums text-slate-900">
                        {d.count.toLocaleString("no-NO")}
                      </strong>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Kandidater
              {diagGateFilter !== "all"
                ? ` — ${GATE_REASON_ORDER.find((g) => g.key === diagGateFilter)?.label || diagGateFilter}`
                : ""}{" "}
              (viser inntil 100)
            </p>
            {failDiagLoading ? (
              <p className="mt-2 text-slate-500">Henter…</p>
            ) : failDiagRows.length === 0 ? (
              <p className="mt-2 text-slate-500">Ingen rader i dette filteret.</p>
            ) : (
              <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-rose-100 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Produkt</th>
                      <th className="px-3 py-2">Gate</th>
                      <th className="px-3 py-2">Årsak</th>
                      <th className="px-3 py-2">Landed / Retail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {failDiagRows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2">
                          <p className="max-w-[220px] truncate font-medium text-slate-900">
                            {r.title}
                          </p>
                          <p className="font-mono text-[10px] text-slate-400">
                            {r.id.slice(0, 16)}
                          </p>
                        </td>
                        <td className="px-3 py-2 font-medium text-rose-800">
                          {r.gateReasonLabel || r.statusLabel}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          <span className="line-clamp-2">
                            {(r.gateProblems || []).join(" · ") || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-slate-700">
                          {fmtNok(r.landedCostNOK)} / {fmtNok(r.retailNOK)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søk i kandidater…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none ring-emerald-600/30 placeholder:text-slate-400 focus:ring-2"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            value={group}
            onChange={setGroup}
            options={filterOptions.groups}
            allLabel="Alle grupper"
          />
          <FilterSelect
            value={category}
            onChange={setCategory}
            options={filterOptions.categories}
            allLabel="Alle kategorier"
          />
          <FilterSelect
            value={supplier}
            onChange={setSupplier}
            options={filterOptions.suppliers.map((s) => ({
              value: s,
              label: supplierLabel(s),
            }))}
            allLabel="Alle leverandører"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
          >
            <option value="all">
              {tab === "ready" ? "Klar for republisering" : "Alle statuser"}
            </option>
            {tab === "fail_gate" ? (
              <>
                <option value="fail_pricing">Feiler pricing</option>
                <option value="fail_margin">Feiler margin</option>
                <option value="fail_freight">Feiler frakt</option>
                <option value="fail_quality">Feiler Quality Gate</option>
              </>
            ) : (
              <option value="ready">Klar for republisering</option>
            )}
          </select>
          <button
            type="button"
            disabled={loading || busy}
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Oppdater
          </button>
        </div>
      </div>

      {/* Batch panel */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-base font-semibold text-emerald-950">
              Batch republisering
            </p>
            <p className="mt-0.5 text-sm text-emerald-900/80">
              Velg kandidater og start en ny publiseringsjobb.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-emerald-950">
              <span>
                <span className="text-emerald-800/80">Valgt:</span>{" "}
                <strong className="tabular-nums">
                  {selectedCount.toLocaleString("no-NO")}
                </strong>
              </span>
              <span>
                <span className="text-emerald-800/80">Est. tid:</span>{" "}
                <strong>{estimateEtaRange(selectedCount)}</strong>
              </span>
              <span>
                <span className="text-emerald-800/80">Est. publiseringer:</span>{" "}
                <strong className="tabular-nums">
                  {selectedCount.toLocaleString("no-NO")}
                </strong>
              </span>
              <span>
                <span className="text-emerald-800/80">Gj.sn. PPM:</span>{" "}
                <strong>
                  {job?.productsPerMin != null
                    ? String(job.productsPerMin)
                    : "50–70"}
                </strong>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-stretch">
            <button
              type="button"
              disabled={
                busy || selectedCount === 0 || job?.status === "running"
              }
              onClick={() => void startRepublish()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <Play className="h-4 w-4 fill-current" />
              {busy ? "Starter…" : "Start republisering"}
            </button>
            <button
              type="button"
              disabled={!summary?.ready}
              onClick={selectAllReady}
              className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
            >
              Velg alle {(summary?.ready || 0).toLocaleString("no-NO")}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-3 py-3" />
                <th className="px-3 py-3">Produkt</th>
                <th className="px-3 py-3">Leverandør</th>
                <th className="px-3 py-3">Kategori</th>
                <th className="px-3 py-3">Gruppe</th>
                <th className="px-3 py-3">Landed Cost</th>
                <th className="px-3 py-3">Retail</th>
                <th className="px-3 py-3">Margin</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Sist oppdatert</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading && rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-3 py-10 text-center text-slate-500"
                  >
                    Henter kandidater…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-3 py-10 text-center text-slate-500"
                  >
                    Ingen kandidater i dette filteret.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-3 align-middle">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        checked={selected.has(r.id)}
                        disabled={r.status !== "ready"}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                          {r.imageUrl ? (
                            <Image
                              src={r.imageUrl}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="44px"
                              unoptimized
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {r.title}
                          </p>
                          <p className="truncate font-mono text-[11px] text-slate-400">
                            {r.id.slice(0, 14)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <p className="font-medium text-slate-800">
                        {supplierLabel(r.supplier)}
                      </p>
                      <p className="max-w-[120px] truncate font-mono text-[11px] text-slate-400">
                        {r.supplierProductId}
                      </p>
                    </td>
                    <td className="px-3 py-3 align-middle text-slate-700">
                      {r.category}
                    </td>
                    <td className="px-3 py-3 align-middle text-slate-700">
                      {r.group}
                    </td>
                    <td className="px-3 py-3 align-middle tabular-nums text-slate-800">
                      {fmtNok(r.landedCostNOK)}
                    </td>
                    <td className="px-3 py-3 align-middle tabular-nums text-slate-800">
                      {fmtNok(r.retailNOK)}
                    </td>
                    <td className="px-3 py-3 align-middle tabular-nums text-slate-800">
                      {fmtPct(r.marginPct)}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <StatusBadge status={r.status} label={r.statusLabel} />
                      {r.gateReason &&
                      r.status !== "ready" &&
                      r.status !== "published" ? (
                        <p className="mt-0.5 max-w-[140px] truncate text-[11px] text-rose-700">
                          {r.gateReasonLabel || r.gateReason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-middle text-slate-500">
                      {fmtRelative(r.updatedAt)}
                    </td>
                    <td className="px-3 py-3 align-middle text-slate-400">
                      <MoreVertical className="h-4 w-4" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            Viser {rangeStart.toLocaleString("no-NO")} til{" "}
            {rangeEnd.toLocaleString("no-NO")} av{" "}
            {filteredTotal.toLocaleString("no-NO")} kandidater
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <PagerBtn
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </PagerBtn>
            {pageWindow(page, totalPages).map((p, i) =>
              p === "…" ? (
                <span
                  key={`e-${i}`}
                  className="px-2 text-sm text-slate-400"
                >
                  …
                </span>
              ) : (
                <PagerBtn
                  key={p}
                  active={p === page}
                  onClick={() => setPage(p)}
                >
                  {p}
                </PagerBtn>
              )
            )}
            <PagerBtn
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </PagerBtn>
          </div>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} per side
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}

function SummaryCard(props: {
  icon: ReactNode;
  iconBg: string;
  value: number;
  title: string;
  subtitle: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = `rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
    props.active
      ? "border-emerald-300 ring-2 ring-emerald-600/15"
      : "border-slate-200 hover:border-slate-300"
  }`;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full ${props.iconBg}`}
        >
          {props.icon}
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
        {props.value.toLocaleString("no-NO")}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{props.title}</p>
      <p className="text-xs text-slate-500">{props.subtitle}</p>
    </>
  );
  if (props.onClick) {
    return (
      <button type="button" onClick={props.onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

function TabButton(props: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
        props.active
          ? "border-emerald-600 text-emerald-800"
          : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {props.label}
    </button>
  );
}

function FilterSelect(props: {
  value: string;
  onChange: (v: string) => void;
  options: string[] | { value: string; label: string }[];
  allLabel: string;
}) {
  const opts = props.options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
    >
      <option value="all">{props.allLabel}</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function StatusBadge(props: { status: RepublishStatus; label: string }) {
  const tone =
    props.status === "ready"
      ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
      : props.status === "published"
        ? "bg-sky-100 text-sky-900 ring-sky-200"
        : props.status === "fail_margin"
          ? "bg-amber-100 text-amber-950 ring-amber-200"
          : "bg-rose-100 text-rose-900 ring-rose-200";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone}`}
    >
      {props.label}
    </span>
  );
}

function PagerBtn(props: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-semibold disabled:opacity-40 ${
        props.active
          ? "bg-emerald-600 text-white"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {props.children}
    </button>
  );
}
