"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  Target,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { BuyerProductCard } from "@/components/admin/BuyerProductCard";
import { BuyerPublishLivePanel } from "@/components/admin/BuyerPublishLivePanel";
import { BuyerPublishMonitor } from "@/components/admin/BuyerPublishMonitor";
import type { DeskBuyerCandidateCard } from "@/lib/ops/desk-buyer-groups";
import type { DislikeReason } from "@/lib/buyer/admin-preferences-client";
import type {
  BuyerPublishJobSnapshot,
  PublishStartPhase,
} from "@/lib/buyer/publish-job-types";
import { classifyAdminError } from "@/lib/admin/data-errors";

type Outcome = {
  candidateId: string;
  title: string;
  status: string;
  problems: string[];
  message: string;
};

type RunSummary = {
  summary: string;
  published: number;
  needsControl: number;
  outcomes: Outcome[];
  dryRun?: boolean;
} | null;

type Props = {
  /** When hunt is running — refresh candidates periodically */
  liveRefresh?: boolean;
};

type FilterState = {
  group: string;
  q: string;
  minMatch: number | null;
};

/**
 * Selection without shipping thousands of ids:
 * - "all": everything matching filters, minus exclusions
 * - "ids": explicit picks
 */
type Selection =
  | { mode: "none" }
  | { mode: "ids"; ids: Set<string> }
  | {
      mode: "all";
      matchedTotal: number;
      excludeIds: Set<string>;
      filterKey: string;
    };

const STORAGE_KEY = "buyer-pick-selection-v1";
const PAGE_SIZE_OPTIONS = [24, 48, 96] as const;
const DEFAULT_PAGE_SIZE = 48;

function filterKeyOf(f: FilterState): string {
  return JSON.stringify({
    group: f.group || "all",
    q: (f.q || "").trim().toLowerCase(),
    minMatch: f.minMatch,
  });
}

function selectedCount(sel: Selection): number {
  if (sel.mode === "none") return 0;
  if (sel.mode === "ids") return sel.ids.size;
  return Math.max(0, sel.matchedTotal - sel.excludeIds.size);
}

function isIdSelected(sel: Selection, id: string): boolean {
  if (sel.mode === "none") return false;
  if (sel.mode === "ids") return sel.ids.has(id);
  return !sel.excludeIds.has(id);
}

/** Shopify-style page window: 1 … 4 5 6 … 12 */
function pageWindow(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  for (let p = current - 1; p <= current + 1; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (current >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

const GROUP_OPTIONS: { id: string; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "gaming", label: "Gaming" },
  { id: "mobil", label: "Mobil" },
  { id: "kontor", label: "Kontor" },
  { id: "audio", label: "Audio" },
  { id: "hjem", label: "Hjem" },
];

/**
 * Normal admin flow: AI finner → Velg → Publiser valgte.
 */
export function BuyerPickFlow({ liveRefresh }: Props) {
  const searchParams = useSearchParams();
  const mission = searchParams.get("mission");
  const family = searchParams.get("family") || "";
  const want = Number(searchParams.get("want") || "6") || 6;

  const [filters, setFilters] = useState<FilterState>(() => ({
    group: searchParams.get("group") || "all",
    q: (searchParams.get("q") || "").trim(),
    minMatch: (() => {
      const n = Number(searchParams.get("minMatch"));
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
  }));
  const [applied, setApplied] = useState<FilterState>(filters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(1);

  // Debounce text search into applied filters
  useEffect(() => {
    const t = setTimeout(() => {
      setApplied((prev) =>
        prev.q === filters.q &&
        prev.group === filters.group &&
        prev.minMatch === filters.minMatch
          ? prev
          : {
              group: filters.group,
              q: filters.q.trim(),
              minMatch: filters.minMatch,
            }
      );
    }, 300);
    return () => clearTimeout(t);
  }, [filters]);

  const [items, setItems] = useState<DeskBuyerCandidateCard[]>([]);
  const [huntThinking, setHuntThinking] = useState<{
    covered: string[];
    seeking: string[];
    updatedAt: string;
  } | null>(null);
  const [discoveryPlan, setDiscoveryPlan] = useState<{
    now: {
      familyId: string;
      label: string;
      groupLabel: string;
      query: string;
      reason: string;
    } | null;
    queue: Array<{
      familyId: string;
      label: string;
      groupLabel: string;
      query: string;
      reason: string;
    }>;
    groupSharePct: Array<{ groupId: string; label: string; pct: number }>;
    updatedAt: string;
    lastDecision?: {
      label: string;
      category: string;
      whyChosen: string[];
      deferred: Array<{ label: string; reasons: string[]; fatiguePct: number }>;
      factors: {
        fatiguePct: number;
        focusStars: number;
        catalogHave: number;
        target: number | null;
        groupSharePct: number;
        groupQuotaPct: number;
        cooldown: boolean;
      };
      observed: {
        shopMatchPct: number | null;
        profitNOK: number | null;
        marginPct: number | null;
        merchScore: number | null;
        sampleCount: number;
      } | null;
      note: string;
    } | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectBusy, setSelectBusy] = useState(false);
  const [selectMenuOpen, setSelectMenuOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>({ mode: "none" });
  const [run, setRun] = useState<RunSummary>(null);
  const [total, setTotal] = useState(0);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [publishJob, setPublishJob] = useState<BuyerPublishJobSnapshot | null>(
    null
  );
  const [publishStartPhase, setPublishStartPhase] =
    useState<PublishStartPhase>("idle");
  const [publishStartError, setPublishStartError] = useState<string | null>(
    null
  );
  const [workerHeartbeat, setWorkerHeartbeat] = useState<string | null>(null);
  const [workerStatus, setWorkerStatus] = useState<string | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const doneToastJobIdRef = useRef<string | null>(null);

  const fKey = useMemo(() => filterKeyOf(applied), [applied]);
  /** Only a real jobId enters publish mode — never optimistic. */
  const publishing = Boolean(publishJob?.id);
  const publishRunning =
    publishJob?.status === "running" || publishJob?.status === "error";
  const startingPublish =
    publishStartPhase === "starting" ||
    publishStartPhase === "creating" ||
    publishStartPhase === "created";
  /** Hide candidate chrome while any publish job (running/error/done) is active. */
  const publishMode = publishing;

  // Filter change → back to page 1
  useEffect(() => {
    setPage(1);
  }, [fKey]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams({
      view: "page",
      group: applied.group || "all",
      page: String(page),
      pageSize: String(pageSize),
      sort: "rank",
    });
    if (applied.q) p.set("q", applied.q);
    if (applied.minMatch != null) p.set("minMatch", String(applied.minMatch));
    return p;
  }, [applied, page, pageSize]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const qs = new URLSearchParams(queryParams.toString());
        // Silent polls must not drain workers (same contract as BuyerClient)
        if (opts?.silent) qs.set("poll", "1");
        const res = await fetch(`/api/admin/buyer?${qs.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "Kunne ikke laste kandidater");
        }
        const pageData = data.page as {
          items: DeskBuyerCandidateCard[];
          total: number;
          totalItems?: number;
          page: number;
          pageSize: number;
          totalPages: number;
        };
        const nextTotal =
          Number(pageData.totalItems ?? pageData.total ?? 0) || 0;
        const nextTotalPages = Math.max(
          1,
          Number(pageData.totalPages) || Math.ceil(nextTotal / pageSize) || 1
        );
        const serverPage = Math.max(1, Number(pageData.page) || page);

        setItems(pageData.items || []);
        setTotal(nextTotal);
        setTotalPages(nextTotalPages);
        if (data.huntThinking && typeof data.huntThinking === "object") {
          setHuntThinking(data.huntThinking);
        }
        if (data.discoveryPlan && typeof data.discoveryPlan === "object") {
          setDiscoveryPlan(data.discoveryPlan);
        }

        // If AI total shrank / client requested past end, follow server page
        if (serverPage !== page) {
          setPage(serverPage);
        }

        // Keep "Velg alle kandidater" in sync while hunt grows total
        setSelection((prev) => {
          if (prev.mode === "all" && prev.filterKey === fKey) {
            if (prev.matchedTotal === nextTotal) return prev;
            return { ...prev, matchedTotal: nextTotal };
          }
          return prev;
        });
      } catch (e: unknown) {
        if (!opts?.silent) toast.error(classifyAdminError(e).reason);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [queryParams, page, pageSize, fKey]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const applyPublishPoll = useCallback(
    (data: {
      job?: BuyerPublishJobSnapshot | null;
      workerHeartbeat?: string | null;
      workerStatus?: string | null;
    }) => {
      if (data.workerHeartbeat !== undefined) {
        setWorkerHeartbeat(data.workerHeartbeat ?? null);
      }
      if (data.workerStatus !== undefined) {
        setWorkerStatus(data.workerStatus ?? null);
      }
      const job = data.job ?? null;
      if (!job?.id) {
        setPublishJob(null);
        return;
      }
      setPublishJob((prev) => {
        if (
          job.status === "done" &&
          prev?.status === "running" &&
          doneToastJobIdRef.current !== job.id
        ) {
          doneToastJobIdRef.current = job.id;
          toast.success(
            `${job.published.toLocaleString("no-NO")} publisert · ${job.skipped} hoppet over`
          );
          void load({ silent: true });
          setSelection({ mode: "none" });
          setPublishStartPhase("idle");
        }
        return job;
      });
      if (job.status === "running") {
        if (job.processed > 0 || job.busy) {
          setPublishStartPhase("idle");
        } else {
          setPublishStartPhase("waiting_worker");
        }
      }
    },
    [load]
  );

  // Poll publish job (read-only) — worker drains batches
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/admin/buyer?view=publish_job");
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.ok) return;
        applyPublishPoll(data);
      } catch {
        /* ignore */
      }
    };
    void poll();
    const live = publishRunning || publishStartPhase === "waiting_worker";
    const t = setInterval(() => void poll(), live ? 2500 : 12_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [publishRunning, publishStartPhase, applyPublishPoll]);

  async function dismissPublishJob() {
    try {
      await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss_publish_job" }),
      });
    } catch {
      /* ignore */
    }
    setPublishJob(null);
    setPublishStartPhase("idle");
    setPublishStartError(null);
  }

  async function resumePublishJob() {
    setResumeBusy(true);
    try {
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume_publish_job" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data.job?.id) {
        throw new Error(data?.error || "Kunne ikke fortsette");
      }
      setPublishJob(data.job as BuyerPublishJobSnapshot);
      toast.success("Fortsetter publisering");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setResumeBusy(false);
    }
  }

  useEffect(() => {
    if (!liveRefresh) return;
    const t = setInterval(() => void load({ silent: true }), 8_000);
    return () => clearInterval(t);
  }, [liveRefresh, load]);

  useEffect(() => {
    if (!selectMenuOpen) return;
    const onDoc = () => setSelectMenuOpen(false);
    // Defer so the opening click doesn't immediately close
    const t = window.setTimeout(() => {
      document.addEventListener("click", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("click", onDoc);
    };
  }, [selectMenuOpen]);

  // Restore selection after refresh
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as {
        mode: string;
        filterKey?: string;
        matchedTotal?: number;
        excludeIds?: string[];
        ids?: string[];
      };
      if (parsed.mode === "all" && parsed.filterKey === fKey) {
        setSelection({
          mode: "all",
          matchedTotal: Number(parsed.matchedTotal || 0),
          excludeIds: new Set(parsed.excludeIds || []),
          filterKey: parsed.filterKey,
        });
      } else if (parsed.mode === "ids" && parsed.filterKey === fKey) {
        setSelection({
          mode: "ids",
          ids: new Set(parsed.ids || []),
        });
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [fKey]);

  // Persist selection
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (selection.mode === "none") {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (selection.mode === "all") {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            mode: "all",
            filterKey: selection.filterKey,
            matchedTotal: selection.matchedTotal,
            excludeIds: [...selection.excludeIds],
          })
        );
        return;
      }
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode: "ids",
          filterKey: fKey,
          ids: [...selection.ids],
        })
      );
    } catch {
      /* quota */
    }
  }, [selection, fKey, hydrated]);

  // Clear select-all when filters change
  useEffect(() => {
    setSelection((prev) => {
      if (prev.mode === "all" && prev.filterKey !== fKey) {
        return { mode: "none" };
      }
      return prev;
    });
    setSelectMenuOpen(false);
  }, [fKey]);

  const visible = useMemo(
    () => items.filter((c) => !doneIds.has(c.id)),
    [items, doneIds]
  );

  const count = selectedCount(selection);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(total, (page - 1) * pageSize + items.length);
  const rangeLabel =
    total === 0
      ? "Ingen kandidater"
      : `Viser ${rangeStart.toLocaleString("no-NO")}–${rangeEnd.toLocaleString("no-NO")} av ${total.toLocaleString("no-NO")} kandidater`;

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/buyer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Feil");
    }
    return data;
  }

  function applyOutcomes(data: {
    summary?: string;
    published?: number;
    needsControl?: number;
    outcomes?: Outcome[];
    dryRun?: boolean;
  }) {
    const outcomes = (data.outcomes || []) as Outcome[];
    setRun({
      summary: String(data.summary || ""),
      published: Number(data.published || 0),
      needsControl: Number(data.needsControl || 0),
      outcomes,
      dryRun: Boolean(data.dryRun),
    });
    const publishedIds = outcomes
      .filter((o) => o.status === "published")
      .map((o) => o.candidateId);
    if (publishedIds.length) {
      setDoneIds((prev) => new Set([...prev, ...publishedIds]));
      setSelection((prev) => {
        if (prev.mode === "ids") {
          const next = new Set(prev.ids);
          for (const id of publishedIds) next.delete(id);
          return next.size ? { mode: "ids", ids: next } : { mode: "none" };
        }
        if (prev.mode === "all") {
          const exclude = new Set(prev.excludeIds);
          for (const id of publishedIds) exclude.add(id);
          return { ...prev, excludeIds: exclude };
        }
        return prev;
      });
    }
  }

  function selectThisPage() {
    const ids = new Set(visible.map((c) => c.id));
    if (ids.size === 0) {
      toast.error("Ingen produkter på denne siden");
      return;
    }
    setSelection({ mode: "ids", ids });
    setSelectMenuOpen(false);
    toast.success(
      `${ids.size.toLocaleString("no-NO")} produkter på siden valgt`
    );
  }

  async function selectAllMatching() {
    setSelectBusy(true);
    setSelectMenuOpen(false);
    try {
      const p = new URLSearchParams({
        view: "ids",
        group: applied.group || "all",
        countOnly: "1",
        limit: "50000",
      });
      if (applied.q) p.set("q", applied.q);
      if (applied.minMatch != null) p.set("minMatch", String(applied.minMatch));
      const res = await fetch(`/api/admin/buyer?${p.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      const matched = Number(data.total || 0);
      if (matched <= 0) {
        toast.error("Ingen kandidater i filteret");
        setSelection({ mode: "none" });
        return;
      }
      setSelection({
        mode: "all",
        matchedTotal: matched,
        excludeIds: new Set(),
        filterKey: fKey,
      });
      toast.success(
        `${matched.toLocaleString("no-NO")} produkter valgt (hele filterresultatet)`
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setSelectBusy(false);
    }
  }

  function clearSelection() {
    setSelection({ mode: "none" });
    setSelectMenuOpen(false);
  }

  function toggleSelect(id: string) {
    setSelection((prev) => {
      if (prev.mode === "all") {
        const exclude = new Set(prev.excludeIds);
        if (exclude.has(id)) exclude.delete(id);
        else exclude.add(id);
        const left = prev.matchedTotal - exclude.size;
        if (left <= 0) return { mode: "none" };
        return { ...prev, excludeIds: exclude };
      }
      const ids = new Set(prev.mode === "ids" ? prev.ids : []);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return ids.size ? { mode: "ids", ids } : { mode: "none" };
    });
  }

  async function publishSelected() {
    if (count === 0 || publishRunning || startingPublish) return;
    setPublishStartError(null);
    setPublishStartPhase("starting");
    try {
      const body =
        selection.mode === "all"
          ? {
              action: "start_publish_job" as const,
              thumbUp: true,
              selection: {
                group: applied.group || "all",
                q: applied.q || undefined,
                minMatch: applied.minMatch ?? undefined,
                excludeIds: [...selection.excludeIds],
              },
            }
          : selection.mode === "ids"
            ? {
                action: "start_publish_job" as const,
                ids: [...selection.ids],
                thumbUp: true,
              }
            : null;
      if (!body) {
        setPublishStartPhase("idle");
        return;
      }
      setPublishStartPhase("creating");
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      const job = data.job as BuyerPublishJobSnapshot | undefined;
      if (!res.ok || !data?.ok || !job?.id) {
        throw new Error(
          data?.error ||
            "Kunne ikke starte publisering. Prøv igjen."
        );
      }
      setPublishStartPhase("created");
      setPublishJob(job);
      setPublishStartPhase("waiting_worker");
      toast.success(
        data.message ||
          `Jobb ${job.id} opprettet — ${job.total.toLocaleString("no-NO")} produkter`
      );
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : "Kunne ikke starte publisering. Prøv igjen.";
      setPublishStartPhase("error");
      setPublishStartError(msg);
      setPublishJob(null);
      toast.error(msg);
    }
  }

  async function onThumb(
    id: string,
    vote: "up" | "down",
    reasons?: DislikeReason[]
  ) {
    setBusy(true);
    try {
      const data = await post({
        action: "feedback_thumb",
        id,
        vote,
        reasons,
      });
      const lines = (data.explanation as string[]) || [];
      if (vote === "down") {
        toast.success(lines[0] || "Lagret — anbefaler ikke denne typen");
        setDoneIds((prev) => new Set([...prev, id]));
        toggleSelectOff(id);
      } else {
        toast.success(lines[0] || "Lagret — finner flere lignende");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelectOff(id: string) {
    setSelection((prev) => {
      if (prev.mode === "ids") {
        const ids = new Set(prev.ids);
        ids.delete(id);
        return ids.size ? { mode: "ids", ids } : { mode: "none" };
      }
      if (prev.mode === "all") {
        const exclude = new Set(prev.excludeIds);
        exclude.add(id);
        const left = prev.matchedTotal - exclude.size;
        if (left <= 0) return { mode: "none" };
        return { ...prev, excludeIds: exclude };
      }
      return prev;
    });
  }

  async function publishIds(ids: string[], thumbUp: boolean) {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const data = await post({
        action: "approve_and_publish",
        ids,
        thumbUp,
        dryRun: false,
      });
      applyOutcomes(data);
      toast.success(String(data.summary || "Ferdig"));
      void load({ silent: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  }

  function goToPage(next: number) {
    const clamped = Math.max(1, Math.min(totalPages, next));
    if (clamped === page) return;
    setPage(clamped);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function changePageSize(size: number) {
    setPageSize(size);
    setPage(1);
  }

  const pagerPages = pageWindow(page, totalPages);

  return (
    <section className="space-y-4">
      {publishMode && publishJob ? (
        <BuyerPublishLivePanel
          job={publishJob}
          workerStatus={workerStatus}
          workerHeartbeat={workerHeartbeat}
          resumeBusy={resumeBusy}
          onResume={() => void resumePublishJob()}
          onRetryStart={() => {
            void dismissPublishJob().then(() => {
              setPublishStartPhase("idle");
            });
          }}
          onDismiss={
            publishJob.status === "done" || publishJob.status === "error"
              ? () => void dismissPublishJob()
              : undefined
          }
        />
      ) : null}

      {!publishMode && startingPublish ? (
        <section className="rounded-2xl border border-sky-200 bg-sky-50/80 p-5">
          <p className="text-sm font-semibold text-sky-950">Starter publisering…</p>
          <ol className="mt-3 space-y-1.5 text-sm text-sky-900">
            {(
              [
                ["starting", "Starter…"],
                ["creating", "Oppretter jobb…"],
                ["created", "Jobb opprettet"],
                ["waiting_worker", "Venter på worker…"],
              ] as const
            ).map(([phase, label]) => {
              const order = [
                "starting",
                "creating",
                "created",
                "waiting_worker",
              ] as const;
              const cur = Math.max(0, order.indexOf(publishStartPhase as (typeof order)[number]));
              const idx = order.indexOf(phase);
              const state =
                idx < cur ? "done" : idx === cur ? "active" : "pending";
              return (
                <li key={phase}>
                  <span className="tabular-nums">
                    {state === "done" ? "✓" : state === "active" ? "→" : "·"}
                  </span>{" "}
                  {label}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {!publishMode && publishStartPhase === "error" ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50/80 p-5">
          <p className="text-sm font-semibold text-rose-950">
            Kunne ikke starte publisering.
          </p>
          <p className="mt-1 text-sm text-rose-800">Prøv igjen.</p>
          {publishStartError ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-rose-900">
                Vis detaljer
              </summary>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-white/80 p-2 text-[11px] text-slate-700">
                {publishStartError}
              </pre>
            </details>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPublishStartPhase("idle");
                setPublishStartError(null);
                void publishSelected();
              }}
              className="rounded-xl bg-rose-800 px-3 py-2 text-sm font-semibold text-white"
            >
              Prøv igjen
            </button>
            <button
              type="button"
              onClick={() => {
                setPublishStartPhase("idle");
                setPublishStartError(null);
              }}
              className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-900"
            >
              Lukk
            </button>
          </div>
        </section>
      ) : null}

      {!publishMode ? (
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Produktkjøper
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          AI finner → du velger → AI publiserer
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          <strong>JA</strong> = lik denne typen. <strong>NEI</strong> = ikke
          anbefal. <strong>Velg</strong> = jeg vil ha produktet. Deretter{" "}
          <strong>Publiser valgte</strong>.
        </p>
        <ol className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
          {["1. AI finner", "2. Du velger", "3. AI klargjør + publiserer"].map(
            (s) => (
              <li
                key={s}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"
              >
                {s}
              </li>
            )
          )}
            </ol>
      </header>
      ) : null}

      {!publishMode && (mission === "gap" || applied.q) && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
          <div className="flex items-start gap-2">
            <Target className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <p className="font-semibold text-emerald-950">
                Oppdrag: Finn{" "}
                {applied.q || family || "produkter som fyller hullet"}
              </p>
              <p className="mt-1 text-sm text-emerald-900/80">
                Ønsket: {want} gode kandidater
                {family ? ` · Familie: ${family}` : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {!publishMode &&
        huntThinking &&
        (huntThinking.covered.length > 0 || huntThinking.seeking.length > 0) && (
          <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
            <p className="text-sm font-semibold text-violet-950">
              AI tenker akkurat nå
            </p>
            <ul className="mt-2 space-y-1 text-sm text-violet-900">
              {huntThinking.covered.map((line) => (
                <li key={`c-${line}`}>✓ {line}</li>
              ))}
              {huntThinking.seeking.map((line) => (
                <li key={`s-${line}`}>✓ {line}</li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-violet-800/70">
              Bygger butikk — familie først, ikke høyest totalscore.
            </p>
          </div>
        )}

      {!publishMode &&
        discoveryPlan &&
        (discoveryPlan.now || discoveryPlan.queue.length > 0) && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
            <p className="text-sm font-semibold text-sky-950">
              AI planlegger neste søk
            </p>
            <ul className="mt-2 space-y-1 text-sm text-sky-900">
              {discoveryPlan.now && (
                <li>
                  <span className="text-sky-800/70">Nå:</span> ✓{" "}
                  {discoveryPlan.now.label}
                  {discoveryPlan.now.reason ? (
                    <span className="text-sky-800/60">
                      {" "}
                      — {discoveryPlan.now.reason}
                    </span>
                  ) : null}
                </li>
              )}
              {discoveryPlan.queue.slice(0, 3).map((q, i) => (
                <li key={`dq-${q.familyId}-${i}`}>
                  <span className="text-sky-800/70">
                    {i === 0 ? "Neste:" : i === 1 ? "Deretter:" : "Etter det:"}
                  </span>{" "}
                  {q.label}
                </li>
              ))}
              {discoveryPlan.queue.slice(3, 5).map((q, i) => (
                <li key={`dr-${q.familyId}-${i}`}>
                  <span className="text-sky-800/70">Reserve:</span> {q.label}
                </li>
              ))}
            </ul>
            {discoveryPlan.groupSharePct.some((g) => g.pct > 0) && (
              <div className="mt-3 border-t border-sky-200/80 pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-sky-800/70">
                  Søketid siste jakt
                </p>
                <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm text-sky-900 sm:grid-cols-4">
                  {discoveryPlan.groupSharePct
                    .filter((g) => g.pct > 0)
                    .map((g) => (
                      <li key={g.groupId}>
                        {g.label}{" "}
                        <span className="font-medium tabular-nums">
                          {g.pct}%
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {discoveryPlan.lastDecision && (
              <div className="mt-3 border-t border-sky-200/80 pt-3 text-sm text-sky-950">
                <p className="text-[11px] font-medium uppercase tracking-wide text-sky-800/70">
                  Siste Discovery-beslutning
                </p>
                <p className="mt-1 font-medium">
                  {discoveryPlan.lastDecision.label}
                  <span className="font-normal text-sky-800/70">
                    {" "}
                    · {discoveryPlan.lastDecision.category}
                  </span>
                </p>
                <ul className="mt-1.5 space-y-0.5 text-sky-900">
                  {discoveryPlan.lastDecision.whyChosen.map((w) => (
                    <li key={w}>✔ {w}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-sky-800/80">
                  Fatigue {discoveryPlan.lastDecision.factors.fatiguePct} % ·
                  Fokus {discoveryPlan.lastDecision.factors.focusStars}★ ·
                  Gruppe {discoveryPlan.lastDecision.factors.groupSharePct} % /
                  kvote {discoveryPlan.lastDecision.factors.groupQuotaPct} %
                  {discoveryPlan.lastDecision.factors.cooldown
                    ? " · cooldown"
                    : ""}
                </p>
                {discoveryPlan.lastDecision.observed &&
                  discoveryPlan.lastDecision.observed.sampleCount > 0 && (
                    <p className="mt-1 text-[11px] text-sky-800/70">
                      Observert yield (n=
                      {discoveryPlan.lastDecision.observed.sampleCount}): match{" "}
                      {discoveryPlan.lastDecision.observed.shopMatchPct ?? "—"}{" "}
                      % · margin{" "}
                      {discoveryPlan.lastDecision.observed.marginPct ?? "—"} % ·
                      profit{" "}
                      {discoveryPlan.lastDecision.observed.profitNOK ?? "—"} NOK
                    </p>
                  )}
                {discoveryPlan.lastDecision.deferred.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-sky-800/70">
                      Utsatt
                    </p>
                    <ul className="mt-1 space-y-1">
                      {discoveryPlan.lastDecision.deferred
                        .slice(0, 3)
                        .map((u) => (
                          <li key={u.label}>
                            <span className="font-medium">{u.label}</span>
                            <span className="block text-[11px] text-sky-800/70">
                              {u.reasons[0]}
                              {u.fatiguePct > 0
                                ? ` · Fatigue ${u.fatiguePct} %`
                                : ""}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                <p className="mt-2 text-[10px] text-sky-800/60">
                  {discoveryPlan.lastDecision.note}
                </p>
              </div>
            )}
            <p className="mt-2 text-[11px] text-sky-800/70">
              Discovery velger hva som søkes — Merch Score avgjør fortsatt hva
              som er godt nok.
            </p>
          </div>
        )}

      {!publishMode && run && (
        <div
          className={`rounded-2xl border p-4 ${
            run.needsControl > 0
              ? "border-amber-200 bg-amber-50/80"
              : "border-emerald-200 bg-emerald-50/80"
          }`}
        >
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            {run.needsControl > 0 ? (
              <AlertTriangle className="h-5 w-5 text-amber-700" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
            )}
            {run.summary}
          </p>
          {run.outcomes.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {run.outcomes.slice(0, 8).map((o) => (
                <li key={o.candidateId}>
                  <span className="font-medium">{o.title.slice(0, 48)}</span>
                  {" — "}
                  {o.message}
                  {o.problems[1] ? ` · ${o.problems[1]}` : ""}
                </li>
              ))}
            </ul>
          )}
          {run.needsControl > 0 && (
            <Link
              href="/admin/suppliers/import-queue"
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-900 hover:underline"
            >
              Åpne Avansert kontroll <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}

      {/* Filters + bulk — sticky over the grid on desktop */}
      {!publishMode ? (
      <div className="sticky top-2 z-20 space-y-3 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:p-4">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Kategori
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {GROUP_OPTIONS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, group: g.id }))}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                    filters.group === g.id
                      ? "bg-emerald-700 text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Butikkmatch ≥
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={filters.minMatch ?? ""}
              placeholder="f.eks. 80"
              onChange={(e) => {
                const n = Number(e.target.value);
                setFilters((f) => ({
                  ...f,
                  minMatch:
                    e.target.value === "" || !Number.isFinite(n) ? null : n,
                }));
              }}
              className="mt-1 w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="text-xs font-semibold text-slate-500">Søk</label>
            <input
              type="search"
              value={filters.q}
              onChange={(e) =>
                setFilters((f) => ({ ...f, q: e.target.value.trimStart() }))
              }
              placeholder="Tittel / kategori…"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
            />
          </div>
        </div>

        {/* Bulk selection */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                disabled={busy || selectBusy || total === 0}
                onClick={() => setSelectMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:border-emerald-400 disabled:opacity-40"
              >
                {selectBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Velger…
                  </>
                ) : (
                  <>
                    Velg alle
                    <ChevronDown className="h-4 w-4" />
                  </>
                )}
              </button>
              {selectMenuOpen && (
                <div className="absolute left-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    className="block w-full px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50"
                    onClick={selectThisPage}
                  >
                    Velg alle på denne siden
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">
                      {visible.length.toLocaleString("no-NO")} synlige
                    </span>
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50"
                    onClick={() => void selectAllMatching()}
                  >
                    Velg alle {total.toLocaleString("no-NO")} kandidater
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">
                      Hele filterresultatet
                    </span>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={busy || count === 0}
              onClick={clearSelection}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Fjern valg
            </button>
            <p className="text-sm font-semibold tabular-nums text-slate-800">
              Valgt: {count.toLocaleString("no-NO")}
              {selection.mode === "all" ? (
                <span className="ml-1 font-normal text-slate-500">
                  (hele filteret
                  {selection.excludeIds.size > 0
                    ? `, −${selection.excludeIds.size}`
                    : ""}
                  )
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm tabular-nums text-slate-600">{rangeLabel}</p>
            <button
              type="button"
              disabled={busy || count === 0 || startingPublish}
              onClick={() => void publishSelected()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
            >
              {startingPublish ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {startingPublish
                ? "Oppretter jobb…"
                : `Publiser valgte (${count.toLocaleString("no-NO")})`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            >
              Oppdater
            </button>
          </div>
        </div>
      </div>
      ) : null}

      {count >= 100 && !publishJob && !startingPublish ? (
        <p className="text-sm text-slate-600">
          {count.toLocaleString("no-NO")} produkter valgt. Publiser valgte
          oppretter en jobb — workeren kjører batchene (du kan lukke nettleseren).
        </p>
      ) : null}

      {!publishMode && !startingPublish ? (
        <BuyerPublishMonitor
          job={null}
          workerStatus={workerStatus}
          workerHeartbeat={workerHeartbeat}
        />
      ) : null}

      {!publishMode ? (
        <>
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : visible.length === 0 && total === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <p className="font-medium text-slate-800">
            Ingen kandidater matching filteret akkurat nå
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Start en produktjakt øverst, eller juster filteret.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <p className="font-medium text-slate-800">
            Ingen synlige produkter på denne siden
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Prøv forrige side, eller oppdater listen.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 min-[1280px]:grid-cols-3 min-[1600px]:grid-cols-4 min-[1920px]:grid-cols-5">
          {visible.map((card) => (
            <BuyerProductCard
              key={card.id}
              card={card}
              density="large"
              busy={busy}
              selected={isIdSelected(selection, card.id)}
              onSelect={toggleSelect}
              onImport={(id) => void publishIds([id], true)}
              onReviewed={() => undefined}
              onThumb={onThumb}
              primaryActionLabel="Publiser"
            />
          ))}
        </ul>
      )}

      {/* Shopify-style pagination footer */}
      {total > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm tabular-nums text-slate-600">{rangeLabel}</p>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => goToPage(page - 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Forrige
            </button>
            {pagerPages.map((p, i) =>
              p === "…" ? (
                <span
                  key={`e-${i}`}
                  className="px-1.5 text-sm text-slate-400"
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  disabled={loading}
                  onClick={() => goToPage(p)}
                  className={`inline-flex h-9 min-w-9 items-center justify-center rounded-xl px-2.5 text-sm font-semibold ${
                    p === page
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => goToPage(page + 1)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Neste
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="whitespace-nowrap">Per side</span>
            <select
              value={pageSize}
              disabled={loading}
              onChange={(e) => changePageSize(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
        </>
      ) : null}
    </section>
  );
}
