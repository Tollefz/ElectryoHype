"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  Eye,
  Loader2,
  Pause,
  Play,
  Square,
  Star,
  X,
} from "lucide-react";
import {
  CATEGORY_MISSIONS,
  MISSION_SIZE_OPTIONS,
  MISSION_SIZE_TARGETS,
  MISSION_STAGE_ORDER,
  REJECT_BUCKET_LABELS,
  stageLabel,
  type BuyerMissionHistoryRow,
  type BuyerMissionSize,
  type BuyerMissionStage,
  type BuyerScanProgress,
  type BuyerScanResultSummary,
  type RejectBucketId,
} from "@/lib/buyer/category-missions";
import type { DeskBuyerCandidateCard } from "@/lib/ops/desk-buyer-groups";
import { HuntReportPanel } from "@/components/admin/HuntReportPanel";
import { FriendlySupplierErrorAlert } from "@/components/admin/FriendlySupplierErrorAlert";
import type { ProductHuntReport } from "@/lib/buyer/hunt-report";

type ScanLite = {
  id: string;
  status: string;
  scanned: number;
  kept: number;
  filtered: number;
  targetScanCount: number;
  error: string | null;
  startedAt?: string | null;
};

type Props = {
  /** Compact mode for embedding on Rob's Desk */
  compact?: boolean;
};

type LiveMetrics = {
  productsPerMin: number;
  remaining: number;
  etaMinutes: number | null;
  scanned: number;
  kept: number;
  filtered: number;
  target: number;
  analyzed: number;
  discarded: number;
  candidates: number;
  imported: number;
  published: number;
  pendingJobs?: number;
  claimedJobs?: number;
  jobsPerMinute?: number;
  avgWaitMs?: number | null;
  avgRuntimeMs?: number | null;
  lastActiveWorker?: string | null;
  lastActiveAt?: string | null;
  checkpoint: {
    page: number;
    seedIdx: number;
    supplierIdx: number;
  };
};

type FeedEvent = { id: string; time: string; message: string };

type OpsLite = {
  scanId?: string | null;
  workerId?: string | null;
  productsPerMin?: number | null;
  queue?: {
    pending?: number;
    claimed?: number;
    jobsPerMinute?: number;
    avgWaitMs?: number | null;
    avgRuntimeMs?: number | null;
  } | null;
  checkpoint?: {
    page?: number | null;
    seedIdx?: number | null;
    supplierIdx?: number | null;
  } | null;
  scanned?: number;
  kept?: number;
  filtered?: number;
  target?: number;
};

const STAGE_CHIP_LABEL: Partial<Record<BuyerMissionStage, string>> = {
  connecting_suppliers: "Kobler til leverandører",
  reading_profile: "Leser butikkprofil",
  reading_memory: "Leser Store Memory",
  scanning: "Scanner produkter",
  analyzing: "Analyserer",
  filtering: "Forkaster",
  scoring: "Bygger AI-score",
  seo: "Genererer SEO",
  pricing: "Prissetter",
  quality_gate: "Quality Gate",
  importing: "Importerer",
  review: "Review",
  done: "Ferdig",
};

function formatDuration(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}t ${m}m`;
}

function feedMessage(
  progress: Partial<BuyerScanProgress> | null,
  scan: ScanLite | null,
  ops: OpsLite | null,
  metrics: LiveMetrics | null
): string | null {
  if (!progress?.stage && !scan?.status) return null;
  const stage = progress?.stage;
  if (scan?.status === "paused" || stage === "paused") {
    return "Mission pauset — checkpoint lagret";
  }
  if (stage === "connecting_suppliers") return "Starter oppdrag";
  if (stage === "reading_profile") return "Laster butikkprofil";
  if (stage === "reading_memory") return "Leser Store Memory";
  if (stage === "scanning") {
    const sup = progress?.supplierLabel;
    return sup ? `Henter ${sup}` : "Henter produkter fra leverandør";
  }
  if (stage === "analyzing") {
    const n = metrics?.analyzed ?? ops?.scanned ?? scan?.scanned ?? progress?.current;
    return n != null ? `Analysert ${n.toLocaleString("no-NO")}` : "Analyserer";
  }
  if (stage === "filtering") {
    const n = metrics?.discarded ?? ops?.filtered ?? scan?.filtered ?? progress?.filtered;
    return n != null ? `Forkastet ${n.toLocaleString("no-NO")}` : "Forkaster";
  }
  if (stage === "scoring") return "Bygger AI-score";
  if (stage === "seo") return "Genererer SEO";
  if (stage === "pricing") return "Prissetter";
  if (stage === "quality_gate") return "Quality Gate";
  if (stage === "importing") return "Importerer";
  if (stage === "review") {
    const n = metrics?.candidates ?? ops?.kept ?? scan?.kept ?? progress?.kept;
    return n != null ? `Beholdt ${n.toLocaleString("no-NO")}` : "Klar til review";
  }
  if (stage === "done") return "Ferdig";
  if (scan?.status === "queued") return "Starter oppdrag";
  return progress?.stageLabel || null;
}

/**
 * Digital Buyer missions — Robin picks category + mission size. AI does the rest.
 * Live Mission Control: pause / resume / stop + live candidates while scanning.
 */
export function DeskBuyerMissions({ compact }: Props) {
  const [missionSize, setMissionSize] = useState<BuyerMissionSize>("standard");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [scan, setScan] = useState<ScanLite | null>(null);
  const [progress, setProgress] = useState<Partial<BuyerScanProgress> | null>(null);
  const [result, setResult] = useState<BuyerScanResultSummary | null>(null);
  const [huntReport, setHuntReport] = useState<ProductHuntReport | null>(null);
  const [discoverySummary, setDiscoverySummary] = useState<{
    summary: string;
    behavedAsExpected: boolean;
    expectationNotes: string[];
    decisionCount: number;
    mostPrioritizedGroups: Array<{ label: string; sharePct: number }>;
    highFatigueFamilies: unknown[];
  } | null>(null);
  const [history, setHistory] = useState<BuyerMissionHistoryRow[]>([]);
  const [ops, setOps] = useState<OpsLite | null>(null);
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [rejectBreakdown, setRejectBreakdown] = useState<Record<
    RejectBucketId,
    number
  > | null>(null);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [showLive, setShowLive] = useState(false);
  const [liveCandidates, setLiveCandidates] = useState<DeskBuyerCandidateCard[]>([]);
  const [topFinds, setTopFinds] = useState<DeskBuyerCandidateCard[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DeskBuyerCandidateCard | null>(null);
  const lastFeedKey = useRef<string>("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/buyer?poll=1");
      const data = await res.json();
      if (!res.ok || !data?.ok) return;
      setScan(data.scan || null);
      setProgress(data.progress || null);
      setResult(data.result || null);
      setHuntReport(data.huntReport || null);
      setDiscoverySummary(
        data.discoveryValidation?.summary || data.discoverySummary || null
      );
      setHistory(Array.isArray(data.history) ? data.history : []);
      setOps(data.ops || null);
    } catch {
      /* keep last good state */
    }
  }, []);

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/buyer?view=live");
      const data = await res.json();
      if (!res.ok || !data?.ok) return;
      if (data.scan) setScan(data.scan);
      if (data.progress) setProgress(data.progress);
      if (data.result) setResult(data.result);
      if (data.huntReport) setHuntReport(data.huntReport as ProductHuntReport);
      if (data.discoveryValidation?.summary || data.discoverySummary) {
        setDiscoverySummary(
          data.discoveryValidation?.summary || data.discoverySummary
        );
      }
      if (data.metrics) setMetrics(data.metrics as LiveMetrics);
      if (data.rejectBreakdown) {
        setRejectBreakdown(data.rejectBreakdown as Record<RejectBucketId, number>);
      }
      if (Array.isArray(data.candidates)) {
        setLiveCandidates(data.candidates as DeskBuyerCandidateCard[]);
      }
      if (Array.isArray(data.topFinds)) {
        setTopFinds(data.topFinds as DeskBuyerCandidateCard[]);
      }
    } catch {
      /* keep last */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active =
    scan?.status === "running" ||
    scan?.status === "queued" ||
    scan?.status === "paused";
  const isPaused = scan?.status === "paused";
  const isRunning = scan?.status === "running" || scan?.status === "queued";

  // One poller while mission active — live snapshot only (no duplicate full GET + drain)
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      await loadLive();
      if (!cancelled) await load();
    };
    void tick();
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(() => void tick(), showLive ? 5_000 : 8_000);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active, showLive, load, loadLive]);

  useEffect(() => {
    if (!active && progress?.stage !== "done") return;
    const msg = feedMessage(progress, scan, ops, metrics);
    if (!msg) return;
    const key = `${scan?.status}:${progress?.stage}:${metrics?.analyzed ?? ops?.scanned ?? scan?.scanned ?? 0}:${metrics?.discarded ?? ops?.filtered ?? scan?.filtered ?? 0}:${metrics?.candidates ?? ops?.kept ?? scan?.kept ?? 0}`;
    if (key === lastFeedKey.current) return;
    lastFeedKey.current = key;
    const now = new Date();
    const time = now.toLocaleTimeString("no-NO", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setFeed((prev) =>
      [{ id: `${Date.now()}-${key}`, time, message: msg }, ...prev].slice(0, 40)
    );
  }, [active, progress, scan, ops, metrics]);

  async function startMission(categoryId: string) {
    setBusyId(categoryId);
    try {
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_mission",
          categoryId,
          missionSize,
          quantityChoice: missionSize,
          processInline: false,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Kunne ikke starte");
      toast.success(
        missionSize === "night"
          ? "Night Mission startet — fortsetter over netter"
          : "AI bygger kategorien nå"
      );
      setScan(data.scan || null);
      setFeed([]);
      lastFeedKey.current = "";
      await load();
      await loadLive();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusyId(null);
    }
  }

  async function control(
    action: "pause_mission" | "resume_mission" | "stop_mission"
  ) {
    setControlBusy(true);
    try {
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          scanRunId: scan?.id,
          ...(action === "stop_mission" ? { reason: "Stoppet av deg" } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      if (action === "pause_mission") toast.success("Mission pauset — checkpoint lagret");
      if (action === "resume_mission") toast.success("Fortsetter fra checkpoint");
      if (action === "stop_mission") toast.success("Mission stoppet");
      if (data.scan) setScan(data.scan);
      await load();
      await loadLive();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setControlBusy(false);
    }
  }

  async function importOne(id: string) {
    setImportingId(id);
    try {
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_ids", ids: [id] }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      toast.success("Importert til kø — scanning fortsetter");
      await loadLive();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setImportingId(null);
    }
  }

  function markApprovedLocal(id: string) {
    toast.success("Godkjent — klar for import når du vil");
    setLiveCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, recommendation: "Importer." } : c))
    );
  }

  const rejectRows = useMemo(() => {
    const b = rejectBreakdown || progress?.rejectBreakdown;
    if (!b) return [];
    return (Object.keys(REJECT_BUCKET_LABELS) as RejectBucketId[])
      .map((id) => ({
        id,
        label: REJECT_BUCKET_LABELS[id],
        count: Number(b[id] || 0),
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [rejectBreakdown, progress]);

  const pct =
    metrics?.target && metrics.target > 0
      ? Math.min(100, Math.round((metrics.scanned / metrics.target) * 100))
      : progress?.total && progress.total > 0
        ? Math.min(100, Math.round(((progress.current || 0) / progress.total) * 100))
        : scan?.targetScanCount
          ? Math.min(100, Math.round((scan.scanned / scan.targetScanCount) * 100))
          : 0;

  const missionTarget = MISSION_SIZE_TARGETS[missionSize];
  const stageChips = MISSION_STAGE_ORDER.filter((s) => s !== "done");

  const analyzed = metrics?.analyzed ?? ops?.scanned ?? scan?.scanned ?? 0;
  const discarded = metrics?.discarded ?? ops?.filtered ?? scan?.filtered ?? 0;
  const candidatesCount = metrics?.candidates ?? ops?.kept ?? scan?.kept ?? 0;
  const imported = metrics?.imported ?? result?.imported ?? 0;
  const published = metrics?.published ?? result?.published ?? 0;
  const productsPerMin = metrics?.productsPerMin ?? 0;
  const etaMinutes = metrics?.etaMinutes;
  const remaining = metrics?.remaining ?? Math.max(0, (scan?.targetScanCount ?? 0) - (scan?.scanned ?? 0));

  return (
    <section
      id="desk-missions"
      className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-white to-sky-50/40 p-4 shadow-sm sm:p-5"
    >
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-900">
          AI-oppdrag — bygg en kategori
        </h2>
        <p className="text-sm text-slate-600">
          Du velger kategori og størrelse. Jeg scanner, forkaster og importerer kun det
          beste — som en innkjøpsavdeling.
        </p>
      </div>

      <div className="mb-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Oppdragsstørrelse
        </p>
        <div className="flex flex-wrap gap-2">
          {MISSION_SIZE_OPTIONS.map((q) => (
            <button
              key={q.value}
              type="button"
              disabled={active}
              onClick={() => setMissionSize(q.value)}
              className={`rounded-xl border px-3 py-1.5 text-left text-sm font-semibold transition ${
                missionSize === q.value
                  ? "border-emerald-600 bg-emerald-700 text-white"
                  : "border-slate-200 bg-white text-slate-800 hover:border-emerald-300"
              } disabled:opacity-50`}
            >
              <span className="block">{q.label}</span>
              <span
                className={`block text-[11px] font-medium ${
                  missionSize === q.value ? "text-emerald-100" : "text-slate-500"
                }`}
              >
                {q.detail}
              </span>
            </button>
          ))}
        </div>
      </div>

      <ul className={`grid gap-2 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {CATEGORY_MISSIONS.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              disabled={active || busyId === m.id}
              onClick={() => void startMission(m.id)}
              className="flex w-full flex-col rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-400 hover:shadow disabled:opacity-60"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="text-xl" aria-hidden>
                  {m.emoji}
                </span>
                {m.label}
                {busyId === m.id ? (
                  <Loader2 className="ml-auto h-4 w-4 animate-spin text-emerald-700" />
                ) : null}
              </span>
              {!compact && (
                <>
                  <span className="mt-1 block text-xs text-slate-500">
                    {m.subcategories.slice(0, 4).join(" · ")}
                    {m.subcategories.length > 4
                      ? ` · +${m.subcategories.length - 4}`
                      : ""}
                  </span>
                  <span className="mt-1 block text-[11px] font-medium text-emerald-800">
                    Mål: {missionTarget.toLocaleString("no-NO")} ·{" "}
                    {m.subcategories.length} underkategorier
                  </span>
                </>
              )}
            </button>
          </li>
        ))}
      </ul>

      {(active || progress?.stage) && (
        <div className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mission Control
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {progress?.categoryLabel || "Digital Buyer"}
                {isPaused ? " · Pauset" : isRunning ? " · Kjører" : ""}
              </p>
              <p className="text-sm text-emerald-800">
                {isPaused
                  ? "Pauset — checkpoint lagret. Fortsett når du er klar."
                  : progress?.stageLabel ||
                    (progress?.stage
                      ? stageLabel(progress.stage as BuyerMissionStage)
                      : "Kobler til leverandører…")}
              </p>
              {progress?.seedQuery && (
                <p className="mt-0.5 text-xs text-slate-500">
                  Underkategori-søk: {progress.seedQuery}
                </p>
              )}
            </div>
            <p className="text-sm font-semibold tabular-nums text-slate-700">
              {analyzed.toLocaleString("no-NO")} /{" "}
              {(metrics?.target ?? scan?.targetScanCount ?? 0).toLocaleString("no-NO")}
            </p>
          </div>

          {/* Control buttons */}
          <div className="flex flex-wrap gap-2">
            {isRunning && (
              <button
                type="button"
                disabled={controlBusy}
                onClick={() => void control("pause_mission")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 disabled:opacity-50"
              >
                {controlBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Pause className="h-3.5 w-3.5" />
                )}
                Pause
              </button>
            )}
            {isPaused && (
              <button
                type="button"
                disabled={controlBusy}
                onClick={() => void control("resume_mission")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {controlBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Fortsett
              </button>
            )}
            {active && (
              <button
                type="button"
                disabled={controlBusy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Stoppe mission? Checkpoint beholdes i historikk, men scanning avsluttes."
                    )
                  ) {
                    void control("stop_mission");
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 disabled:opacity-50"
              >
                <Square className="h-3.5 w-3.5" />
                Stopp
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowLive(true);
                void loadLive();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Eye className="h-3.5 w-3.5" />
              Se kandidater
              {candidatesCount > 0
                ? ` (${candidatesCount.toLocaleString("no-NO")})`
                : ""}
            </button>
            <a
              href="/admin/buyer#ai-mission-control"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Mission Control
            </a>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${
                isPaused ? "bg-amber-500" : "bg-emerald-600"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Live explanation */}
          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <Metric label="Analysert" value={analyzed} />
            <Metric label="Forkastet" value={discarded} />
            <Metric label="Kandidater" value={candidatesCount} tone="ok" />
            <Metric label="Importert" value={imported} />
            <Metric label="Publisert" value={published} />
          </dl>

          {/* ETA / throughput — from Buyer Hunt Worker processing, not UI poll clock */}
          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <Metric
              label="Produkter/min"
              value={productsPerMin > 0 ? productsPerMin : "—"}
            />
            <Metric label="Gjenværende" value={remaining} />
            <Metric
              label="ETA"
              value={etaMinutes != null ? `~${etaMinutes} min` : "—"}
            />
            <Metric
              label="Pending jobs"
              value={metrics?.pendingJobs ?? ops?.queue?.pending ?? "—"}
            />
            <Metric
              label="Claimed"
              value={metrics?.claimedJobs ?? ops?.queue?.claimed ?? "—"}
            />
            <Metric
              label="Jobs/min"
              value={
                (metrics?.jobsPerMinute ?? ops?.queue?.jobsPerMinute ?? 0) > 0
                  ? (metrics?.jobsPerMinute ??
                      ops?.queue?.jobsPerMinute ??
                      0)
                  : "—"
              }
            />
          </dl>

          <ol className="flex flex-wrap gap-1.5">
            {stageChips.map((s) => {
              const activeChip = progress?.stage === s;
              const idx = stageChips.indexOf(s);
              const curIdx = stageChips.indexOf(
                (progress?.stage as (typeof stageChips)[number]) ||
                  "connecting_suppliers"
              );
              const done =
                progress?.stage === "done" ||
                (curIdx >= 0 && curIdx > idx) ||
                (progress?.stage === "paused" &&
                  idx < stageChips.indexOf("scanning"));
              return (
                <li
                  key={s}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    activeChip
                      ? "bg-emerald-700 text-white"
                      : done
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {STAGE_CHIP_LABEL[s] || s}
                </li>
              );
            })}
          </ol>

          {Array.isArray(progress?.subcategoryPlan) &&
            progress!.subcategoryPlan!.length > 0 && (
              <p className="text-xs text-slate-600">
                Plan: {progress!.subcategoryPlan!.join(" · ")}
              </p>
            )}

          {scan?.error && scan.status !== "paused" && (
            <FriendlySupplierErrorAlert raw={scan.error} />
          )}

          {/* Beste funn */}
          {topFinds.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-950">
                <Star className="h-4 w-4 text-amber-600" />
                Beste funn akkurat nå
              </h3>
              <p className="mt-0.5 text-xs text-amber-900/80">
                Score ≥90 — importer mens missionen fortsatt kjører.
              </p>
              <ul className="mt-2 space-y-2">
                {topFinds.slice(0, 5).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 rounded-lg border border-amber-100 bg-white p-2"
                  >
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.imageUrl}
                        alt=""
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-slate-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {c.title}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {c.shopMatchPct}% ·{" "}
                        {c.marginPct != null ? `${c.marginPct}%` : "—"} ·{" "}
                        {c.categoryLabel}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={importingId === c.id}
                      onClick={() => void importOne(c.id)}
                      className="shrink-0 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      {importingId === c.id ? "…" : "Importer"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Live feed */}
          {feed.length > 0 && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Live logg
              </h3>
              <ol className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {feed.map((ev) => (
                  <li key={ev.id} className="flex gap-2 text-xs text-slate-700">
                    <span className="shrink-0 font-mono tabular-nums text-slate-400">
                      {ev.time}
                    </span>
                    <span>{ev.message}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {rejectRows.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h3 className="text-sm font-semibold text-amber-950">
            Hvorfor forkastes produkter
          </h3>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {rejectRows.map((r) => (
              <li
                key={r.id}
                className="flex items-baseline justify-between gap-3 text-sm text-amber-950"
              >
                <span>{r.label}</span>
                <span className="font-semibold tabular-nums">
                  {r.count.toLocaleString("no-NO")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && (progress?.stage === "done" || scan?.status === "completed") && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Resultat</h3>
          <p className="mt-1 text-sm text-slate-700">
            Jeg analyserte {result.analyzed.toLocaleString("no-NO")} produkter.
            Jeg forkastet {result.discarded.toLocaleString("no-NO")}.
            Jeg fant {result.candidates.toLocaleString("no-NO")} kandidater.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Totalt analysert" value={result.analyzed} />
            <Stat label="Forkastet" value={result.discarded} />
            <Stat label="Kandidater" value={result.candidates} />
            <Stat label="Importert" value={result.imported} />
            <Stat label="Publisert" value={result.published} />
            <Stat label="Tid brukt" value={formatDuration(result.durationSec)} />
          </dl>
        </div>
      )}

      {huntReport ? (
          <HuntReportPanel report={huntReport} compact={compact} />
        ) : null}

      {discoverySummary ? (
        <div className="mt-4 rounded-xl border border-sky-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Discovery Summary
          </h3>
          <p className="mt-2 text-sm text-slate-700">{discoverySummary.summary}</p>
          <p className="mt-1 text-xs text-slate-500">
            Oppførte seg som forventet:{" "}
            {discoverySummary.behavedAsExpected ? "ja" : "nei"}
          </p>
          {discoverySummary.expectationNotes.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {discoverySummary.expectationNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <Stat
              label="Beslutninger"
              value={discoverySummary.decisionCount}
            />
            <Stat
              label="Topp gruppe"
              value={
                discoverySummary.mostPrioritizedGroups[0]
                  ? `${discoverySummary.mostPrioritizedGroups[0].label} (${discoverySummary.mostPrioritizedGroups[0].sharePct} %)`
                  : "—"
              }
            />
            <Stat
              label="Høy fatigue"
              value={discoverySummary.highFatigueFamilies.length}
            />
          </dl>
        </div>
      ) : null}

      {history.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Mission History</h3>
            <p className="text-xs text-slate-500">Alle kjøringer lagret</p>
          </div>
          <table className="min-w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Dato</th>
                <th className="px-3 py-2 font-semibold">Kategori</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Tid</th>
                <th className="px-3 py-2 font-semibold tabular-nums">Analysert</th>
                <th className="px-3 py-2 font-semibold tabular-nums">Forkastet</th>
                <th className="px-3 py-2 font-semibold tabular-nums">Kandidater</th>
                <th className="px-3 py-2 font-semibold tabular-nums">Importert</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, compact ? 5 : 15).map((row) => (
                <tr key={row.id} className="border-t border-slate-100 text-slate-800">
                  <td className="whitespace-nowrap px-3 py-2">
                    {new Date(row.date).toLocaleString("no-NO", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{row.category}</span>
                    <span className="ml-1 text-[11px] text-slate-500">
                      {String(row.missionSize)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{row.status}</span>
                    {row.stopReason ? (
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {row.stopReason}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{formatDuration(row.durationSec)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.analyzed.toLocaleString("no-NO")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.discarded.toLocaleString("no-NO")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.candidates.toLocaleString("no-NO")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.imported.toLocaleString("no-NO")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showLive && (
        <LiveCandidatesPanel
          candidates={liveCandidates}
          topFinds={topFinds}
          importingId={importingId}
          scanRunning={isRunning}
          onClose={() => setShowLive(false)}
          onImport={(id) => void importOne(id)}
          onApprove={markApprovedLocal}
          onPreview={setPreview}
          onRefresh={() => void loadLive()}
        />
      )}

      {preview && (
        <PreviewModal card={preview} onClose={() => setPreview(null)} />
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ok";
}) {
  return (
    <div
      className={`rounded-lg border px-2.5 py-2 ${
        tone === "ok"
          ? "border-emerald-200 bg-emerald-50"
          : "border-slate-100 bg-slate-50"
      }`}
    >
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        className={`text-sm font-semibold tabular-nums ${
          tone === "ok" ? "text-emerald-900" : "text-slate-900"
        }`}
      >
        {typeof value === "number" ? value.toLocaleString("no-NO") : value}
      </dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-slate-900">
        {typeof value === "number" ? value.toLocaleString("no-NO") : value}
      </dd>
    </div>
  );
}

function LiveCandidatesPanel({
  candidates,
  topFinds,
  importingId,
  scanRunning,
  onClose,
  onImport,
  onApprove,
  onPreview,
  onRefresh,
}: {
  candidates: DeskBuyerCandidateCard[];
  topFinds: DeskBuyerCandidateCard[];
  importingId: string | null;
  scanRunning: boolean;
  onClose: () => void;
  onImport: (id: string) => void;
  onApprove: (id: string) => void;
  onPreview: (c: DeskBuyerCandidateCard) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <aside className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Live kandidater · auto-refresh 5s
            </p>
            <h3 className="text-sm font-semibold text-slate-900">
              {candidates.length.toLocaleString("no-NO")} beste så langt
            </h3>
            <p className="text-xs text-slate-500">
              {scanRunning
                ? "Scanning fortsetter i bakgrunnen"
                : "Mission pauset / stoppet"}
            </p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700"
            >
              Oppdater
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Lukk"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {topFinds.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-amber-900">
                <Star className="h-3.5 w-3.5" /> Beste funn (≥90)
              </p>
              <ul className="space-y-1.5">
                {topFinds.map((c) => (
                  <LiveCard
                    key={`top-${c.id}`}
                    card={c}
                    highlight
                    importing={importingId === c.id}
                    onImport={() => onImport(c.id)}
                    onApprove={() => onApprove(c.id)}
                    onPreview={() => onPreview(c)}
                  />
                ))}
              </ul>
            </div>
          )}

          {candidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Ingen kandidater ennå — AI scanner fortsatt.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {candidates.map((c) => (
                <LiveCard
                  key={c.id}
                  card={c}
                  importing={importingId === c.id}
                  onImport={() => onImport(c.id)}
                  onApprove={() => onApprove(c.id)}
                  onPreview={() => onPreview(c)}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function LiveCard({
  card,
  highlight,
  importing,
  onImport,
  onApprove,
  onPreview,
}: {
  card: DeskBuyerCandidateCard;
  highlight?: boolean;
  importing: boolean;
  onImport: () => void;
  onApprove: () => void;
  onPreview: () => void;
}) {
  return (
    <li
      className={`flex gap-2 rounded-lg border p-2 ${
        highlight
          ? "border-amber-200 bg-amber-50/50"
          : "border-slate-200 bg-white"
      }`}
    >
      <button type="button" onClick={onPreview} className="shrink-0">
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt=""
            className="h-12 w-12 rounded object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
            —
          </div>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onPreview}
          className="w-full text-left"
        >
          <p className="truncate text-xs font-semibold text-slate-900">
            {card.title}
          </p>
          <p className="text-[11px] text-slate-500">
            Score {card.shopMatchPct}% ·{" "}
            {card.marginPct != null ? `${card.marginPct}%` : "—"} ·{" "}
            {card.categoryLabel}
            {card.retailNOK != null ? ` · ${card.retailNOK} kr` : ""}
          </p>
        </button>
        <div className="mt-1 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={onPreview}
            className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900"
          >
            Godkjenn
          </button>
          <button
            type="button"
            disabled={importing || !card.canImport}
            onClick={onImport}
            className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white disabled:opacity-40"
          >
            {importing ? "…" : "Importer"}
          </button>
        </div>
      </div>
    </li>
  );
}

function PreviewModal({
  card,
  onClose,
}: {
  card: DeskBuyerCandidateCard;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Lukk"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {card.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt=""
            className="mt-3 h-48 w-full rounded-lg object-cover"
          />
        )}
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-slate-50 px-2 py-1.5">
            <dt className="text-slate-400">Butikkmatch</dt>
            <dd className="font-semibold">{card.shopMatchPct}%</dd>
          </div>
          <div className="rounded-md bg-slate-50 px-2 py-1.5">
            <dt className="text-slate-400">Margin</dt>
            <dd className="font-semibold">
              {card.marginPct != null ? `${card.marginPct}%` : "—"}
            </dd>
          </div>
          <div className="rounded-md bg-slate-50 px-2 py-1.5">
            <dt className="text-slate-400">Pris</dt>
            <dd className="font-semibold">
              {card.retailNOK != null ? `${card.retailNOK} kr` : "—"}
            </dd>
          </div>
          <div className="rounded-md bg-slate-50 px-2 py-1.5">
            <dt className="text-slate-400">Kategori</dt>
            <dd className="font-semibold">{card.categoryLabel}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-600">{card.whyFits}</p>
        <p className="mt-1 text-xs text-slate-600">{card.recommendation}</p>
      </div>
    </div>
  );
}
