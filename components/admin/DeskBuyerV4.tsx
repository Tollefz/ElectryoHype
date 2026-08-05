"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CheckSquare,
  ChevronLeft,
  Loader2,
  PanelRightClose,
  Square,
  X,
} from "lucide-react";
import type { DeskBuyerCandidateCard } from "@/lib/ops/desk-buyer-groups";
import type {
  BuyerReviewGroupId,
  BuyerReviewOverview,
  BuyerReviewSort,
} from "@/lib/buyer/review-types";
import { BuyerImageGallery } from "@/components/admin/BuyerImageGallery";
import { useImportJobOptional } from "@/components/admin/ImportJobProvider";
import { DataState } from "@/components/admin/DataState";
import {
  classifyAdminError,
  type AdminDataError,
} from "@/lib/admin/data-errors";

const GROUP_IDS: BuyerReviewGroupId[] = [
  "all",
  "ai-confident",
  "premium",
  "ready",
  "gaming",
  "mobil",
  "audio",
  "kontor",
  "hjem",
  "high-margin",
  "margin-60",
  "score-90",
  "perfect-match",
  "fantastic",
  "low-score",
  "needs-review",
  "new",
];

const SORT_OPTIONS: Array<{ value: BuyerReviewSort; label: string }> = [
  { value: "match", label: "Butikkmatch" },
  { value: "score", label: "AI-score" },
  { value: "margin", label: "Margin" },
  { value: "newest", label: "Nyeste" },
  { value: "price", label: "Pris" },
  { value: "category", label: "Kategori" },
];

const APPROVED_KEY = "ehx:buyer:v4:approvedIds";
const LAST_VISIT_KEY = "ehx:buyer:v4:lastVisit";
const PAGE_SIZE = 100;
/** Fixed dense review columns — do not change with breakpoint (virtualizer slices by this). */
const COLS = 8;

type PageResult = {
  scanRunId: string | null;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  group: BuyerReviewGroupId;
  items: DeskBuyerCandidateCard[];
};

type Props = {
  compact?: boolean;
  scanStatus?: string | null;
};

type ScanOps = {
  scanned?: number;
  kept?: number;
  filtered?: number;
  target?: number;
  productsPerMin?: number | null;
  etaMinutes?: number | null;
};

type FilterState = {
  minMatch: number | null;
  minMargin: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  supplier: string;
  premiumOnly: boolean;
  hasVideo: boolean;
  manyImages: boolean;
  hasAi: boolean;
  unseenOnly: boolean;
};

const EMPTY_FILTERS: FilterState = {
  minMatch: null,
  minMargin: null,
  minPrice: null,
  maxPrice: null,
  supplier: "",
  premiumOnly: false,
  hasVideo: false,
  manyImages: false,
  hasAi: false,
  unseenOnly: false,
};

function readApproved(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(APPROVED_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeApproved(ids: Set<string>) {
  try {
    localStorage.setItem(APPROVED_KEY, JSON.stringify([...ids].slice(-8000)));
  } catch {
    /* ignore */
  }
}

function readLastVisit(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_VISIT_KEY);
  } catch {
    return null;
  }
}

function touchLastVisit() {
  try {
    localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "" || v === false) continue;
    u.set(k, String(v));
  }
  return u.toString();
}

export function DeskBuyerV4({ compact, scanStatus }: Props) {
  if (compact) return <DeskBuyerV4Compact scanStatus={scanStatus} />;
  return <DeskBuyerV4Full scanStatus={scanStatus} />;
}

function DeskBuyerV4Compact({ scanStatus }: { scanStatus?: string | null }) {
  const [overview, setOverview] = useState<BuyerReviewOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<AdminDataError | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/buyer?${qs({ view: "overview", since: readLastVisit() })}`,
          { signal: ac.signal }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          throw Object.assign(new Error(data?.error || "Feil"), {
            status: res.status,
          });
        }
        setOverview(data.overview as BuyerReviewOverview);
        setLoadError(null);
      } catch (e: unknown) {
        if (cancelled) return;
        const status =
          e && typeof e === "object" && "status" in e
            ? Number((e as { status: unknown }).status)
            : (e as { name?: string })?.name === "AbortError"
              ? 408
              : undefined;
        setLoadError(classifyAdminError(e, status));
        setOverview(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ac.abort();
    };
  }, []);

  if (loading && !overview) {
    return <DataState state="loading" surface="buyer" compact />;
  }

  if (loadError || !overview) {
    return (
      <DataState
        state={loadError?.kind === "network" ? "offline" : "error"}
        surface="buyer"
        error={loadError}
        compact
      />
    );
  }

  const total = overview.total;
  const groups = overview.groups || [];

  return (
    <section
      id="desk-buyer"
      className="rounded-2xl border border-emerald-200/80 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Digital Buyer — beslutninger
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {total.toLocaleString("no-NO")} kandidater
            {scanStatus === "running" || scanStatus === "queued"
              ? " · scan kjører"
              : ""}
          </p>
        </div>
        <Link
          href="/admin/buyer"
          className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
        >
          Åpne review
        </Link>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <li className="flex items-center justify-between rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">
          <span className="font-medium">Totalt</span>
          <span className="font-semibold tabular-nums">
            {total.toLocaleString("no-NO")}
          </span>
        </li>
        {groups.map((g) => (
          <li key={g.id}>
            <Link
              href={`/admin/buyer?group=${g.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm hover:border-emerald-300"
            >
              <span className="font-medium text-slate-800">
                <span className="mr-1" aria-hidden>
                  {g.emoji}
                </span>
                {g.label}
              </span>
              <span className="font-semibold tabular-nums text-emerald-800">
                {g.count.toLocaleString("no-NO")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DeskBuyerV4Full({ scanStatus }: { scanStatus?: string | null }) {
  const searchParams = useSearchParams();
  const [sinceIso] = useState<string | null>(() => readLastVisit());
  const [overview, setOverview] = useState<BuyerReviewOverview | null>(null);
  const [group, setGroup] = useState<BuyerReviewGroupId | null>(null);
  const [items, setItems] = useState<DeskBuyerCandidateCard[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [overviewError, setOverviewError] = useState<AdminDataError | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<DeskBuyerCandidateCard | null>(null);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<BuyerReviewSort>("match");
  const [liveScanStatus, setLiveScanStatus] = useState(scanStatus || null);
  const [scanOps, setScanOps] = useState<ScanOps | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const importJob = useImportJobOptional();

  useEffect(() => {
    setApproved(readApproved());
    touchLastVisit();
  }, []);

  useEffect(() => {
    setLiveScanStatus(scanStatus || null);
  }, [scanStatus]);

  const scanRunning =
    liveScanStatus === "running" ||
    liveScanStatus === "queued" ||
    liveScanStatus === "paused";

  useEffect(() => {
    if (!scanRunning) return;
    let cancelled = false;
    const poll = async () => {
      try {
        // Live status only — no full ranking/worker drain
        const res = await fetch("/api/admin/buyer?view=live");
        const data = await res.json();
        if (cancelled || !res.ok || !data?.ok) return;
        setLiveScanStatus(data.scan?.status || null);
        const ops = data.ops || data.progress;
        if (ops || data.scan) {
          const scanned = Number(ops?.scanned ?? data.scan?.scanned ?? 0);
          const target = Number(ops?.target ?? data.scan?.targetScanCount ?? 0);
          let productsPerMin: number | null = null;
          let etaMinutes: number | null = null;
          if (scanned > 0 && data.scan?.startedAt) {
            const elapsedMin =
              (Date.now() - new Date(data.scan.startedAt).getTime()) / 60000;
            if (elapsedMin > 0.2) {
              productsPerMin = Math.round(scanned / elapsedMin);
              if (target > scanned && productsPerMin > 0) {
                etaMinutes = Math.round((target - scanned) / productsPerMin);
              }
            }
          }
          setScanOps({
            scanned,
            kept: Number(ops?.kept ?? data.scan?.kept ?? 0),
            filtered: Number(ops?.filtered ?? data.scan?.filtered ?? 0),
            target,
            productsPerMin,
            etaMinutes,
          });
        }
      } catch {
        /* keep last */
      }
    };
    void poll();
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, 5_000);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [scanRunning]);

  useEffect(() => {
    const raw = searchParams.get("group");
    if (raw && GROUP_IDS.includes(raw as BuyerReviewGroupId)) {
      setGroup(raw as BuyerReviewGroupId);
    }
  }, [searchParams]);

  const filterQuery = useMemo(
    () => ({
      since: sinceIso,
      minMatch: applied.minMatch,
      minMargin: applied.minMargin,
      minPrice: applied.minPrice,
      maxPrice: applied.maxPrice,
      supplier: applied.supplier || null,
      premiumOnly: applied.premiumOnly ? 1 : null,
      hasVideo: applied.hasVideo ? 1 : null,
      manyImages: applied.manyImages ? 1 : null,
      hasAi: applied.hasAi ? 1 : null,
    }),
    [applied, sinceIso]
  );

  const loadOverview = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoadingOverview(true);
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 10_000);
      try {
        const res = await fetch(
          `/api/admin/buyer?${qs({ view: "overview", since: sinceIso })}`,
          { signal: ac.signal }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          throw Object.assign(new Error(data?.error || "Feil"), {
            status: res.status,
          });
        }
        setOverview(data.overview as BuyerReviewOverview);
        setOverviewError(null);
      } catch (e: unknown) {
        if (!opts?.silent) {
          const status =
            e && typeof e === "object" && "status" in e
              ? Number((e as { status: unknown }).status)
              : (e as { name?: string })?.name === "AbortError"
                ? 408
                : undefined;
          const err = classifyAdminError(e, status);
          setOverviewError(err);
          setOverview(null);
          console.error("[buyer:overview]", err.logMessage);
        }
      } finally {
        clearTimeout(timer);
        if (!opts?.silent) setLoadingOverview(false);
      }
    },
    [sinceIso]
  );

  const fetchPage = useCallback(
    async (g: BuyerReviewGroupId, p: number, signal?: AbortSignal) => {
      const res = await fetch(
        `/api/admin/buyer?${qs({
          view: "page",
          group: g,
          page: p,
          pageSize: PAGE_SIZE,
          sort,
          ...filterQuery,
        })}`,
        { signal }
      );
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      return data.page as PageResult;
    },
    [filterQuery, sort]
  );

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // Reset + load first page when group/filters change
  useEffect(() => {
    if (!group) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setItems([]);
    setPage(1);
    setSelected(new Set());
    setLoadingPage(true);
    void (async () => {
      try {
        const result = await fetchPage(group, 1, ac.signal);
        if (ac.signal.aborted) return;
        let nextItems = result.items;
        if (applied.unseenOnly) {
          nextItems = nextItems.filter((c) => !approved.has(c.id));
        }
        setItems(nextItems);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setPage(result.page);
      } catch (e: unknown) {
        if (ac.signal.aborted) return;
        toast.error(e instanceof Error ? e.message : "Kunne ikke laste");
      } finally {
        if (!ac.signal.aborted) setLoadingPage(false);
      }
    })();
    return () => ac.abort();
  }, [group, fetchPage, applied.unseenOnly, sort]); // eslint-disable-line react-hooks/exhaustive-deps -- approved read at load time only

  const loadMore = useCallback(async () => {
    if (!group || loadingMore || loadingPage || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const result = await fetchPage(group, next);
      let batch = result.items;
      if (applied.unseenOnly) {
        batch = batch.filter((c) => !approved.has(c.id));
      }
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...batch.filter((x) => !seen.has(x.id))];
      });
      setPage(result.page);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke laste mer");
    } finally {
      setLoadingMore(false);
    }
  }, [
    group,
    loadingMore,
    loadingPage,
    page,
    totalPages,
    fetchPage,
    applied.unseenOnly,
    approved,
  ]);

  // Infinite scroll — IntersectionObserver + scroll fallback
  useEffect(() => {
    const root = scrollRef.current;
    const el = sentinelRef.current;
    if (!root || !el || !group) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { root, rootMargin: "600px" }
    );
    io.observe(el);
    const onScroll = () => {
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 500) {
        void loadMore();
      }
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      root.removeEventListener("scroll", onScroll);
    };
  }, [group, loadMore, items.length]);

  const rowCount = Math.ceil(items.length / COLS);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 118,
    overscan: 4,
  });

  function openGroup(id: BuyerReviewGroupId) {
    setActive(null);
    setGroup(id);
  }

  function backToOverview() {
    setGroup(null);
    setItems([]);
    setActive(null);
    setSelected(new Set());
    void loadOverview();
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function selectIds(extra?: Record<string, string | number | boolean | null>) {
    if (!group) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/buyer?${qs({
          view: "ids",
          group,
          ...filterQuery,
          ...extra,
        })}`
      );
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
      let ids = data.ids as string[];
      if (applied.unseenOnly) ids = ids.filter((id) => !approved.has(id));
      setSelected(new Set(ids));
      toast.success(`Valgte ${ids.length}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  }

  function markApproved(ids: string[]) {
    setApproved((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      writeApproved(next);
      return next;
    });
  }

  async function postAction(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/buyer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Feil");
    return data;
  }

  async function runBulk(
    action: "approve" | "import" | "reject" | "publish" | "export"
  ) {
    const ids = [...selected];
    if (!ids.length) {
      toast.error("Ingen valgt");
      return;
    }
    setBusy(true);
    try {
      if (action === "approve") {
        markApproved(ids);
        toast.success(`Godkjente ${ids.length}`);
        setSelected(new Set());
        return;
      }
      if (action === "export") {
        const rows = items.filter((c) => selected.has(c.id));
        const header = "id,title,score,margin,price,category,supplier\n";
        const body = rows
          .map(
            (c) =>
              `${c.id},"${(c.title || "").replace(/"/g, '""')}",${c.shopMatchPct},${c.marginPct ?? ""},${c.retailNOK ?? ""},${c.categoryLabel},${c.supplier}`
          )
          .join("\n");
        const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `buyer-export-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Eksporterte ${rows.length}`);
        return;
      }
      if (action === "import" || action === "publish") {
        if (!importJob?.startImportJob) {
          toast.error("Import-widget ikke tilgjengelig — last siden på nytt");
          return;
        }
        importJob.startImportJob(ids);
        markApproved(ids);
        setSelected(new Set());
        toast.success(
          `${ids.length.toLocaleString("no-NO")} sendt til bakgrunnsimport`
        );
        return;
      }
      if (action === "reject") {
        let updated = 0;
        for (let i = 0; i < ids.length; i += 500) {
          const chunk = ids.slice(i, i + 500);
          const data = await postAction({
            action: "review_decide",
            ids: chunk,
            decision: "rejected",
          });
          updated += Number(data.updated || chunk.length);
        }
        toast.success(`Avviste ${updated}`);
        setSelected(new Set());
        setItems((prev) => prev.filter((c) => !ids.includes(c.id)));
        if (active && ids.includes(active.id)) setActive(null);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  }

  if (loadingOverview && !overview) {
    return <DataState state="loading" surface="buyer" />;
  }

  if (overviewError || !overview) {
    return (
      <DataState
        state={overviewError?.kind === "network" ? "offline" : "error"}
        surface="buyer"
        error={overviewError}
        onRetry={() => void loadOverview()}
      />
    );
  }

  const boardTotal = overview.total;
  const groups = overview.groups || [];
  const primary =
    groups.find((g) => g.id === "perfect-match" && g.count > 0) ||
    groups.find((g) => g.id === "fantastic" && g.count > 0) ||
    groups.find((g) => g.id === "score-90" && g.count > 0) ||
    groups.find((g) => g.id === "ai-confident" && g.count > 0) ||
    groups.find((g) => g.count > 0) ||
    null;

  if (!group) {
    if (boardTotal === 0 && !scanRunning) {
      return (
        <section id="desk-buyer" className="space-y-4">
          <DataState
            state="empty"
            surface="buyer"
            onRetry={() => void loadOverview()}
          />
        </section>
      );
    }
    return (
      <section id="desk-buyer" className="space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Digital Buyer · high volume review
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            {boardTotal.toLocaleString("no-NO")} kandidater
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Ingen produktkort her. Velg en gruppe — deretter kompakt review med
            infinite scroll.
            {liveScanStatus === "running" ? " · Scan kjører" : ""}
          </p>
          {primary && (
            <button
              type="button"
              onClick={() => openGroup(primary.id)}
              className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Start · {primary.emoji} {primary.label} (
              {primary.count.toLocaleString("no-NO")})
            </button>
          )}
        </header>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <li>
            <button
              type="button"
              onClick={() => openGroup("all")}
              className="flex w-full items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-left text-white"
            >
              <span className="font-semibold">Totalt</span>
              <span className="text-lg font-bold tabular-nums">
                {boardTotal.toLocaleString("no-NO")}
              </span>
            </button>
          </li>
          {groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                disabled={g.count === 0}
                onClick={() => openGroup(g.id)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:border-emerald-300 disabled:opacity-40"
              >
                <span>
                  <span className="mr-1.5" aria-hidden>
                    {g.emoji}
                  </span>
                  <span className="font-semibold text-slate-900">{g.label}</span>
                </span>
                <span className="text-lg font-bold tabular-nums text-emerald-800">
                  {g.count.toLocaleString("no-NO")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const groupMeta =
    overview?.groups.find((g) => g.id === group) ||
    (group === "all"
      ? { id: "all" as const, label: "Alle", emoji: "📦", count: boardTotal }
      : { id: group, label: group, emoji: "📦", count: total });

  const showingFrom = items.length > 0 ? 1 : 0;
  const showingTo = items.length;
  const loadPct = total > 0 ? Math.min(100, Math.round((items.length / total) * 100)) : 0;
  const nextBatchStart = page * PAGE_SIZE + 1;
  const nextBatchEnd = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <section id="desk-buyer" className="space-y-3">
      <ReviewStatusBar
        total={total}
        showingFrom={showingFrom}
        showingTo={showingTo}
        sort={sort}
        onSortChange={setSort}
        groupLabel={groupMeta.label}
        scanRunning={scanRunning}
        scanOps={scanOps}
      />

      <ReviewLoadProgress
        total={total}
        loaded={items.length}
        loadPct={loadPct}
        loadingMore={loadingMore}
        loadingPage={loadingPage}
        nextBatchStart={nextBatchStart}
        nextBatchEnd={nextBatchEnd}
        page={page}
        totalPages={totalPages}
        scanOps={scanOps}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={backToOverview}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Grupper
          </button>
          <h2 className="truncate text-base font-semibold text-slate-900">
            <span className="mr-1" aria-hidden>
              {groupMeta.emoji}
            </span>
            {groupMeta.label}
            <span className="ml-2 font-normal text-slate-500">
              {total.toLocaleString("no-NO")} totalt
            </span>
          </h2>
        </div>
        {selected.size > 0 && (
          <span className="text-xs font-semibold text-emerald-800">
            {selected.size} valgt
          </span>
        )}
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        onApply={() => setApplied({ ...filters })}
        onReset={() => {
          setFilters(EMPTY_FILTERS);
          setApplied(EMPTY_FILTERS);
        }}
      />

      <BulkBar
        busy={busy}
        selectedCount={selected.size}
        onSelectAll={() => void selectIds()}
        onSelectScore90={() => void selectIds({ minMatch: 90 })}
        onSelectMargin40={() => void selectIds({ minMargin: 40 })}
        onSelectPremium={() => void selectIds({ premiumOnly: 1 })}
        onSelectGaming={() => {
          setGroup("gaming");
        }}
        onSelectNew={() => {
          setGroup("new");
        }}
        onSelectUnseen={() => {
          setFilters((f) => ({ ...f, unseenOnly: true }));
          setApplied((f) => ({ ...f, unseenOnly: true }));
          void selectIds();
        }}
        onClear={() => setSelected(new Set())}
        onApprove={() => void runBulk("approve")}
        onImport={() => void runBulk("import")}
        onPublish={() => void runBulk("publish")}
        onReject={() => void runBulk("reject")}
        onExport={() => void runBulk("export")}
      />

      <div className={`flex gap-3 ${active ? "items-start" : ""}`}>
        <div
          ref={scrollRef}
          className="max-h-[min(78vh,860px)] min-h-[320px] flex-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50/40"
        >
          {loadingPage && items.length === 0 ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
            </div>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-600">
              Ingen produkter med gjeldende filter.
            </p>
          ) : (
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((row) => {
                const start = row.index * COLS;
                const rowItems = items.slice(start, start + COLS);
                return (
                  <div
                    key={row.key}
                    className="absolute left-0 top-0 grid w-full grid-cols-8 gap-1 px-1"
                    style={{
                      height: row.size,
                      transform: `translateY(${row.start}px)`,
                    }}
                  >
                    {rowItems.map((card) => (
                      <CompactCard
                        key={card.id}
                        card={card}
                        selected={selected.has(card.id)}
                        approved={approved.has(card.id)}
                        active={active?.id === card.id}
                        onToggle={() => toggle(card.id)}
                        onOpen={() => setActive(card)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          <div ref={sentinelRef} className="h-8 w-full" />
          {loadingMore && (
            <div className="flex justify-center py-3">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            </div>
          )}
          {!loadingMore && page >= totalPages && items.length > 0 && (
            <p className="py-3 text-center text-[11px] text-slate-400">
              Alle {total.toLocaleString("no-NO")} lastet
            </p>
          )}
        </div>

        {active && (
          <SidePanel
            card={active}
            busy={busy}
            onClose={() => setActive(null)}
            onImport={async () => {
              if (importJob?.startImportJob) {
                importJob.startImportJob([active.id]);
                markApproved([active.id]);
                toast.success("Sendt til bakgrunnsimport");
                return;
              }
              setBusy(true);
              try {
                await postAction({ action: "import_ids", ids: [active.id] });
                markApproved([active.id]);
                toast.success("Importert til kø");
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : "Feil");
              } finally {
                setBusy(false);
              }
            }}
            onApprove={() => {
              markApproved([active.id]);
              toast.success("Godkjent");
            }}
            onReject={async () => {
              setBusy(true);
              try {
                await postAction({
                  action: "review_decide",
                  ids: [active.id],
                  decision: "rejected",
                });
                toast.success("Avvist");
                setItems((prev) => prev.filter((c) => c.id !== active.id));
                setActive(null);
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : "Feil");
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </div>
    </section>
  );
}

function CompactCard({
  card,
  selected,
  approved,
  active,
  onToggle,
  onOpen,
}: {
  card: DeskBuyerCandidateCard;
  selected: boolean;
  approved: boolean;
  active: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const imgCount = card.images?.length || (card.imageUrl ? 1 : 0);
  const hasVideo = (card.videos?.length || 0) > 0;

  return (
    <div
      className={`overflow-hidden rounded-md border bg-white ${
        active
          ? "border-emerald-500 ring-1 ring-emerald-400"
          : selected
            ? "border-emerald-300"
            : approved
              ? "border-slate-100 opacity-70"
              : "border-slate-200"
      }`}
    >
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          className="block w-full bg-slate-100"
          aria-label={card.title}
        >
          {card.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.imageUrl}
              alt=""
              loading="lazy"
              className="h-12 w-full object-cover sm:h-14"
            />
          ) : (
            <div className="flex h-12 items-center justify-center text-[10px] text-slate-400 sm:h-14">
              —
            </div>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="absolute left-0.5 top-0.5 rounded bg-white/90 p-0.5 shadow-sm"
          aria-label={selected ? "Fjern valg" : "Velg"}
        >
          {selected ? (
            <CheckSquare className="h-3 w-3 text-emerald-700" />
          ) : (
            <Square className="h-3 w-3 text-slate-600" />
          )}
        </button>
        <span className="absolute right-0.5 top-0.5 rounded bg-emerald-800/90 px-1 text-[9px] font-bold text-white">
          {card.shopMatchPct}
        </span>
        {card.isPremium && (
          <span className="absolute bottom-0.5 left-0.5 rounded bg-amber-500/90 px-0.5 text-[8px] font-bold text-white">
            ★
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="w-full px-1 py-0.5 text-left"
      >
        <p className="truncate text-[10px] font-medium leading-tight text-slate-900">
          {card.title}
        </p>
        <p className="truncate text-[9px] leading-tight text-slate-500">
          {card.marginPct != null ? `${card.marginPct}%` : "—"} ·{" "}
          {card.retailNOK != null ? `${card.retailNOK}kr` : "—"} ·{" "}
          {card.categoryLabel}
        </p>
        <div className="mt-0.5 flex flex-wrap gap-0.5">
          {card.deliveryHint && (
            <CardChip title={card.deliveryHint}>🚚</CardChip>
          )}
          {hasVideo && <CardChip title="Video">▶</CardChip>}
          {imgCount > 1 && <CardChip title={`${imgCount} bilder`}>{imgCount}📷</CardChip>}
          {card.inStock && <CardChip title="På lager">✓</CardChip>}
        </div>
      </button>
    </div>
  );
}

function CardChip({ children, title }: { children: ReactNode; title: string }) {
  return (
    <span
      title={title}
      className="rounded bg-slate-100 px-0.5 text-[8px] font-semibold text-slate-600"
    >
      {children}
    </span>
  );
}

function ReviewStatusBar({
  total,
  showingFrom,
  showingTo,
  sort,
  onSortChange,
  groupLabel,
  scanRunning,
  scanOps,
}: {
  total: number;
  showingFrom: number;
  showingTo: number;
  sort: BuyerReviewSort;
  onSortChange: (s: BuyerReviewSort) => void;
  groupLabel: string;
  scanRunning: boolean;
  scanOps: ScanOps | null;
}) {
  return (
    <header className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">
            {total.toLocaleString("no-NO")}{" "}
            <span className="text-base font-medium text-slate-600">anbefalinger</span>
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{groupLabel}</span>
            {" · "}
            Viser{" "}
            <span className="font-semibold tabular-nums text-emerald-800">
              {showingFrom}–{showingTo}
            </span>{" "}
            av {total.toLocaleString("no-NO")}
          </p>
        </div>
        <label className="flex flex-col gap-0.5 text-[11px] text-slate-500">
          Sortering
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as BuyerReviewSort)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {scanRunning && scanOps && (
        <p className="mt-2 text-xs text-emerald-800">
          AI scanner: {scanOps.scanned?.toLocaleString("no-NO")} /{" "}
          {scanOps.target?.toLocaleString("no-NO")}
          {scanOps.productsPerMin != null && ` · ${scanOps.productsPerMin} produkter/min`}
          {scanOps.etaMinutes != null && ` · ETA ~${scanOps.etaMinutes} min`}
        </p>
      )}
    </header>
  );
}

function ReviewLoadProgress({
  total,
  loaded,
  loadPct,
  loadingMore,
  loadingPage,
  nextBatchStart,
  nextBatchEnd,
  page,
  totalPages,
  scanOps,
}: {
  total: number;
  loaded: number;
  loadPct: number;
  loadingMore: boolean;
  loadingPage: boolean;
  nextBatchStart: number;
  nextBatchEnd: number;
  page: number;
  totalPages: number;
  scanOps: ScanOps | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all"
          style={{ width: `${loadPct}%` }}
        />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-5">
        <div>
          <dt className="text-slate-500">Kandidater</dt>
          <dd className="font-semibold tabular-nums text-slate-900">
            {total.toLocaleString("no-NO")}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Viser</dt>
          <dd className="font-semibold tabular-nums text-emerald-800">
            {loaded.toLocaleString("no-NO")}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Laster</dt>
          <dd className="font-semibold tabular-nums text-slate-800">
            {loadingMore || loadingPage
              ? page < totalPages
                ? `${nextBatchStart}–${nextBatchEnd}`
                : "…"
              : loaded >= total
                ? "Ferdig"
                : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Produkter/min</dt>
          <dd className="font-semibold tabular-nums text-slate-800">
            {scanOps?.productsPerMin != null ? scanOps.productsPerMin : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">ETA</dt>
          <dd className="font-semibold tabular-nums text-slate-800">
            {scanOps?.etaMinutes != null ? `~${scanOps.etaMinutes} min` : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function FilterBar({
  filters,
  onChange,
  onApply,
  onReset,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch });
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 text-[11px]">
      <Num label="Score ≥" value={filters.minMatch} onChange={(n) => set({ minMatch: n })} />
      <Num label="Margin ≥" value={filters.minMargin} onChange={(n) => set({ minMargin: n })} />
      <Num label="Pris ≥" value={filters.minPrice} onChange={(n) => set({ minPrice: n })} />
      <Num label="Pris ≤" value={filters.maxPrice} onChange={(n) => set({ maxPrice: n })} />
      <label className="flex flex-col gap-0.5 text-slate-500">
        Leverandør
        <input
          className="w-24 rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-800"
          value={filters.supplier}
          onChange={(e) => set({ supplier: e.target.value })}
        />
      </label>
      <Toggle
        label="Premium"
        on={filters.premiumOnly}
        onClick={() => set({ premiumOnly: !filters.premiumOnly })}
      />
      <Toggle
        label="Video"
        on={filters.hasVideo}
        onClick={() => set({ hasVideo: !filters.hasVideo })}
      />
      <Toggle
        label="Mange bilder"
        on={filters.manyImages}
        onClick={() => set({ manyImages: !filters.manyImages })}
      />
      <Toggle
        label="Har AI"
        on={filters.hasAi}
        onClick={() => set({ hasAi: !filters.hasAi })}
      />
      <Toggle
        label="Ikke sett"
        on={filters.unseenOnly}
        onClick={() => set({ unseenOnly: !filters.unseenOnly })}
      />
      <TinyBtn onClick={onApply}>Filtrer</TinyBtn>
      <TinyBtn onClick={onReset}>Nullstill</TinyBtn>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-slate-500">
      {label}
      <input
        type="number"
        className="w-14 rounded border border-slate-200 px-1 py-1 text-xs text-slate-800"
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
      />
    </label>
  );
}

function Toggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
        on
          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {label}
    </button>
  );
}

function BulkBar({
  busy,
  selectedCount,
  onSelectAll,
  onSelectScore90,
  onSelectMargin40,
  onSelectPremium,
  onSelectGaming,
  onSelectNew,
  onSelectUnseen,
  onClear,
  onApprove,
  onImport,
  onPublish,
  onReject,
  onExport,
}: {
  busy: boolean;
  selectedCount: number;
  onSelectAll: () => void;
  onSelectScore90: () => void;
  onSelectMargin40: () => void;
  onSelectPremium: () => void;
  onSelectGaming: () => void;
  onSelectNew: () => void;
  onSelectUnseen: () => void;
  onClear: () => void;
  onApprove: () => void;
  onImport: () => void;
  onPublish: () => void;
  onReject: () => void;
  onExport: () => void;
}) {
  return (
    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex flex-wrap gap-1.5">
        <TinyBtn disabled={busy} onClick={onSelectAll}>
          Velg alle
        </TinyBtn>
        <TinyBtn disabled={busy} onClick={onSelectScore90}>
          Velg AI &gt;90
        </TinyBtn>
        <TinyBtn disabled={busy} onClick={onSelectMargin40}>
          Velg Margin &gt;40
        </TinyBtn>
        <TinyBtn disabled={busy} onClick={onSelectPremium}>
          Velg Premium
        </TinyBtn>
        <TinyBtn disabled={busy} onClick={onSelectGaming}>
          Velg Gaming
        </TinyBtn>
        <TinyBtn disabled={busy} onClick={onSelectNew}>
          Velg Nye
        </TinyBtn>
        <TinyBtn disabled={busy} onClick={onSelectUnseen}>
          Velg Uleste
        </TinyBtn>
        {selectedCount > 0 && (
          <TinyBtn disabled={busy} onClick={onClear}>
            Nullstill ({selectedCount})
          </TinyBtn>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-1.5">
        <TinyBtn disabled={busy || !selectedCount} onClick={onApprove} tone="ok">
          Godkjenn valgte
        </TinyBtn>
        <TinyBtn
          disabled={busy || !selectedCount}
          onClick={onImport}
          tone="primary"
        >
          Importer valgte
        </TinyBtn>
        <TinyBtn disabled={busy || !selectedCount} onClick={onPublish} tone="ok">
          Publiser valgte
        </TinyBtn>
        <TinyBtn disabled={busy || !selectedCount} onClick={onReject} tone="danger">
          Avvis valgte
        </TinyBtn>
        <TinyBtn disabled={busy || !selectedCount} onClick={onExport}>
          Eksporter valgte
        </TinyBtn>
      </div>
    </div>
  );
}

function TinyBtn({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "ok" | "danger";
}) {
  const toneCls =
    tone === "primary"
      ? "bg-slate-900 text-white border-slate-900"
      : tone === "ok"
        ? "bg-emerald-50 text-emerald-900 border-emerald-200"
        : tone === "danger"
          ? "bg-rose-50 text-rose-800 border-rose-200"
          : "bg-white text-slate-700 border-slate-200";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[11px] font-semibold disabled:opacity-40 ${toneCls}`}
    >
      {children}
    </button>
  );
}

function SidePanel({
  card,
  busy,
  onClose,
  onImport,
  onApprove,
  onReject,
}: {
  card: DeskBuyerCandidateCard;
  busy: boolean;
  onClose: () => void;
  onImport: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [gallery, setGallery] = useState(false);

  return (
    <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-hidden border-l border-slate-200 bg-white shadow-2xl lg:sticky lg:top-3 lg:z-10 lg:h-auto lg:max-h-[min(78vh,860px)] lg:rounded-xl lg:border lg:shadow-lg">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Sidepanel · samme side
          </p>
          <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">
            {card.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
          aria-label="Lukk"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[min(70vh,40rem)] space-y-3 overflow-y-auto p-3">
        <button
          type="button"
          onClick={() => setGallery(true)}
          className="relative block w-full overflow-hidden rounded-lg bg-slate-100"
        >
          {card.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageUrl} alt="" className="h-40 w-full object-cover" />
          ) : (
            <div className="flex h-40 items-center justify-center text-xs text-slate-400">
              Ingen bilde
            </div>
          )}
          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {(card.images?.length || 0) + (card.videos?.length || 0)} media · galleri
          </span>
        </button>

        {(card.images?.length || 0) > 1 && (
          <div className="flex gap-1 overflow-x-auto">
            {card.images.slice(0, 8).map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setGallery(true)}
                className="h-12 w-12 shrink-0 overflow-hidden rounded border border-slate-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                <span className="sr-only">Bilde {i + 1}</span>
              </button>
            ))}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <Row label="Butikkmatch" value={`${card.shopMatchPct}%`} />
          <Row label="Confidence" value={`${card.confidence}%`} />
          <Row
            label="Margin"
            value={card.marginPct != null ? `${card.marginPct}%` : "—"}
          />
          <Row
            label="Pris"
            value={card.retailNOK != null ? `${card.retailNOK} kr` : "—"}
          />
          <Row label="Kategori" value={card.categoryLabel} />
          <Row label="Varianter" value={String(card.variantCount || 0)} />
          <Row label="Leverandør" value={card.supplier} />
          <Row label="Levering" value={card.deliveryHint || "—"} />
          <Row
            label="Importstatus"
            value={card.canImport ? "Klar til import" : "Mangler merch-kobling"}
          />
          <Row
            label="Media"
            value={`${card.images?.length || 0} bilder · ${card.videos?.length || 0} video`}
          />
        </dl>

        <div>
          <p className="text-[11px] font-semibold text-slate-700">AI-analyse</p>
          <p className="mt-0.5 text-xs text-slate-600">{card.recommendation}</p>
          <p className="mt-1 text-xs text-slate-600">{card.whyChosen}</p>
          <p className="mt-1 text-xs text-slate-600">{card.whyFits}</p>
          {card.why?.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
              {card.why.slice(0, 6).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {card.risks?.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
              {card.risks.map((r) => (
                <li key={r}>⚠ {r}</li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold text-slate-700">SEO / short</p>
          <p className="mt-0.5 text-xs text-slate-600">{card.shortReason || "—"}</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold text-slate-700">Historikk</p>
          <p className="mt-0.5 text-xs text-slate-600">
            Funnet:{" "}
            {card.createdAt
              ? new Date(card.createdAt).toLocaleString("no-NO")
              : "—"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-slate-100 p-3">
        <button
          type="button"
          disabled={busy || !card.canImport}
          onClick={onImport}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          Importer
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onApprove}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900"
        >
          Godkjenn
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800"
        >
          Avvis
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <BuyerImageGallery
        open={gallery}
        onClose={() => setGallery(false)}
        images={
          card.images?.length ? card.images : card.imageUrl ? [card.imageUrl] : []
        }
        videos={card.videos || []}
        title={card.title}
      />
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-1.5">
      <dt className="text-[10px] text-slate-400">{label}</dt>
      <dd className="font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
