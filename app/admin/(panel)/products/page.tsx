"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
} from "lucide-react";
import toast from "react-hot-toast";
import ProductsTable, { type AdminProductRow } from "@/components/admin/ProductsTable";
import AiCategorizeProgressModal, {
  type AiCategorizeProgress,
} from "@/components/admin/AiCategorizeProgressModal";
import { getAllDbValues } from "@/lib/categories";
import { AI_CATEGORY_BATCH_SIZE } from "@/lib/admin/ai-categorize-constants";
import { DataState } from "@/components/admin/DataState";
import {
  classifyAdminError,
  type AdminDataError,
} from "@/lib/admin/data-errors";

type QuickFilter =
  | "all"
  | "imported_today"
  | "missing_category"
  | "wrong_category"
  | "ai_suggested"
  | "ai_needs_review"
  | "low_score"
  | "needs_review"
  | "no_seo"
  | "missing_images"
  | "low_margin";

const PAGE_SIZES = [25, 50, 100, 250] as const;

const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "imported_today", label: "Importert i dag" },
  { id: "missing_category", label: "Mangler kategori" },
  { id: "wrong_category", label: "Feil kategori" },
  { id: "ai_suggested", label: "AI foreslått" },
  { id: "ai_needs_review", label: "Trenger review" },
  { id: "missing_images", label: "Mangler bilder" },
  { id: "low_score", label: "Lav score" },
  { id: "needs_review", label: "Generell review" },
  { id: "no_seo", label: "Mangler SEO" },
  { id: "low_margin", label: "Lav margin" },
];

export default function AdminProducts() {
  const searchParams = useSearchParams();
  const initialFilter = (searchParams.get("filter") || "all") as QuickFilter;
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [categories, setCategories] = useState<string[]>(getAllDbValues());
  const [loading, setLoading] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(
    QUICK_FILTERS.some((f) => f.id === initialFilter) ? initialFilter : "all"
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkSupplier, setBulkSupplier] = useState("temu");
  const [aiProgress, setAiProgress] = useState<AiCategorizeProgress | null>(null);
  const [selectMode, setSelectMode] = useState<"page" | "filtered" | null>(null);
  const [fetchError, setFetchError] = useState<AdminDataError | null>(null);
  const fetchSeq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setSelectMode(null);
  }, [debouncedSearch, categoryFilter, supplierFilter, statusFilter, quickFilter, pageSize]);

  const fetchProducts = useCallback(async (pageOverride?: number) => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setFetchError(null);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    const pageToUse = pageOverride ?? page;
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw Object.assign(new Error("offline"), { status: 0 });
      }
      const params = new URLSearchParams();
      params.set("page", String(pageToUse));
      params.set("limit", String(pageSize));
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (supplierFilter !== "all") params.set("supplier", supplierFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (quickFilter !== "all") params.set("filter", quickFilter);

      const response = await fetch(`/api/admin/products?${params.toString()}`, {
        signal: ac.signal,
      });
      const data = await response.json().catch(() => null);

      // Ignore stale responses (race when filters change quickly)
      if (seq !== fetchSeq.current) {
        return;
      }

      if (!response.ok || !data?.ok) {
        throw Object.assign(
          new Error(data?.error || "Kunne ikke hente produkter"),
          { status: response.status }
        );
      }

      if (!Array.isArray(data.data)) {
        throw new Error("Ugyldig svar fra serveren. Prøv å laste siden på nytt.");
      }

      // Never accept empty page when API count says products exist
      if (data.data.length === 0 && (data.pagination?.total ?? 0) > 0) {
        const err = classifyAdminError(
          "Listen er midlertidig ute av synk. Last siden på nytt, eller prøv et annet filter."
        );
        setFetchError(err);
        toast.error(err.reason);
        return;
      }

      setProducts(data.data);
      setTotal(data.pagination?.total ?? data.data.length);
      setTotalPages(data.pagination?.totalPages ?? 1);
      if (Array.isArray(data.categories) && data.categories.length > 0) {
        setCategories(data.categories);
      }
      setFetchError(null);
    } catch (error) {
      if (seq !== fetchSeq.current) return;
      const status =
        error && typeof error === "object" && "status" in error
          ? Number((error as { status: unknown }).status)
          : (error as { name?: string })?.name === "AbortError"
            ? 408
            : undefined;
      const err = classifyAdminError(error, status);
      setFetchError(err);
      setProducts([]);
      setTotal(0);
      toast.error(err.reason);
      console.error("[products]", err.logMessage);
    } finally {
      clearTimeout(timer);
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [
    page,
    pageSize,
    debouncedSearch,
    categoryFilter,
    supplierFilter,
    statusFilter,
    quickFilter,
  ]);

  // Filters change → always fetch page 1 (avoid race with stale high page)
  useEffect(() => {
    void fetchProducts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filter-driven page-1 fetch
  }, [debouncedSearch, categoryFilter, supplierFilter, statusFilter, quickFilter, pageSize]);

  // Pagination only
  useEffect(() => {
    void fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- page clicks only
  }, [page]);

  const selectedCount = selectedIds.size;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectMode(null);
  };

  const toggleSelectPage = useCallback((checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const p of products) {
        if (checked) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
    setSelectMode(checked ? "page" : null);
  }, [products]);

  // Ctrl+A selects all products visible on the current page
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "a") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      toggleSelectPage(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSelectPage]);

  const selectAllFiltered = async () => {
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "250");
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (supplierFilter !== "all") params.set("supplier", supplierFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (quickFilter !== "all") params.set("filter", quickFilter);

      const response = await fetch(`/api/admin/products?${params.toString()}`);
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.data)) {
        toast.error("Kunne ikke hente filtrerte produkter");
        return;
      }

      if ((data.pagination?.total ?? 0) > 250) {
        toast(
          `Velger første 250 av ${data.pagination.total} filtrerte produkter. Kjør flere ganger for resten.`
        );
      }

      setSelectedIds(new Set(data.data.map((p: AdminProductRow) => p.id)));
      setSelectMode("filtered");
    } catch {
      toast.error("Kunne ikke velge filtrerte produkter");
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(null);
    setBulkAction("");
  };

  const runAiCategorize = async () => {
    if (selectedIds.size === 0) {
      toast.error("Velg minst ett produkt");
      return;
    }
    const ids = Array.from(selectedIds);
    if (
      !confirm(
        `AI-kategorisere ${ids.length} produkt(er)?\n\n>90 % uten kategori settes automatisk.\n70–90 % (og overskriving) går til godkjenningskø.\n<70 % → trenger review.`
      )
    ) {
      return;
    }

    const progress: AiCategorizeProgress = {
      total: ids.length,
      done: 0,
      autoApplied: 0,
      pending: 0,
      needsReview: 0,
      errors: 0,
      running: true,
      finished: false,
    };
    setAiProgress({ ...progress });
    setBulkLoading(true);

    try {
      for (let i = 0; i < ids.length; i += AI_CATEGORY_BATCH_SIZE) {
        const batch = ids.slice(i, i + AI_CATEGORY_BATCH_SIZE);
        const res = await fetch("/api/admin/products/ai-categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: batch }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "AI-kategorisering feilet");
        }
        const s = data.summary || {};
        progress.done = Math.min(ids.length, i + batch.length);
        progress.autoApplied += Number(s.auto_applied || 0) + Number(s.unchanged || 0);
        progress.pending += Number(s.pending_approval || 0);
        progress.needsReview += Number(s.needs_review || 0);
        progress.errors += Number(s.error || 0);
        setAiProgress({ ...progress });
      }
      progress.running = false;
      progress.finished = true;
      setAiProgress({ ...progress });
      toast.success(
        `${progress.autoApplied} kategorisert · ${progress.pending} venter · ${progress.needsReview} review`
      );
      clearSelection();
      await fetchProducts();
    } catch (error) {
      progress.running = false;
      progress.finished = true;
      setAiProgress({ ...progress });
      toast.error(error instanceof Error ? error.message : "AI-kategorisering feilet");
    } finally {
      setBulkLoading(false);
    }
  };

  const runBulkAction = async (
    action: string,
    extra?: Record<string, unknown>
  ) => {
    if (selectedIds.size === 0) {
      toast.error("Velg minst ett produkt");
      return;
    }

    const ids = Array.from(selectedIds);
    const payload: Record<string, unknown> = { action, ids, ...extra };

    if (action === "delete") {
      if (!confirm(`Slett ${ids.length} produkter?`)) return;
    } else if (action === "archive") {
      if (!confirm(`Arkivere ${ids.length} produkter?`)) return;
    } else if (action === "activate") {
      if (!confirm(`Aktivere ${ids.length} produkter?`)) return;
    } else if (action === "deactivate") {
      if (!confirm(`Deaktivere ${ids.length} produkter?`)) return;
    } else if (action === "move_category") {
      if (!bulkCategory) {
        toast.error("Velg kategori");
        return;
      }
      payload.category = bulkCategory;
    } else if (action === "change_supplier") {
      payload.supplierName = bulkSupplier === "__none__" ? null : bulkSupplier;
    } else if (action === "ai_categorize") {
      await runAiCategorize();
      return;
    } else if (action === "run_ai" || action === "generate_seo") {
      if (
        !confirm(
          `Kjøre ${action === "run_ai" ? "AI" : "SEO"} på ${ids.length} produkt(er)? Dette kan ta tid.`
        )
      ) {
        return;
      }
    }

    setBulkLoading(true);
    try {
      const response = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Bulk-handling feilet");
      }

      const failed = Array.isArray(data.results)
        ? data.results.filter((r: { ok: boolean }) => !r.ok).length
        : 0;

      if (action === "delete") {
        if (failed > 0) {
          toast.success(
            data.message ||
              `Slettet ${data.updated ?? 0} produkter (${failed} hoppet over)`
          );
        } else {
          toast.success(data.message || `Slettet ${data.updated ?? ids.length} produkter`);
        }
      } else if (failed > 0) {
        toast.error(`${data.updated || 0} OK, ${failed} feilet`);
      } else {
        const labels: Record<string, string> = {
          archive: "Arkivert",
          activate: "Aktivert",
          deactivate: "Deaktivert",
        };
        toast.success(
          `${labels[action] || "Oppdatert"} ${data.updated ?? ids.length} produkter`
        );
      }

      clearSelection();
      await fetchProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk-handling feilet");
    } finally {
      setBulkLoading(false);
    }
  };

  const runBulk = async () => {
    if (!bulkAction) {
      toast.error("Velg en bulk-handling");
      return;
    }
    await runBulkAction(bulkAction);
  };

  const acceptSuggestion = async (product: AdminProductRow) => {
    if (!product.categorySuggestion) return;
    const response = await fetch("/api/admin/products/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "accept_category_suggestions",
        ids: [product.id],
        suggestions: {
          [product.id]: {
            category: product.categorySuggestion.category,
            subcategory: product.categorySuggestion.subcategory,
          },
        },
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      toast.error(data.error || "Kunne ikke godta forslag");
      return;
    }
    toast.success(`Kategori satt til ${product.categorySuggestion.label}`);
    await fetchProducts();
  };

  const issueCounts = useMemo(() => {
    const counts = {
      missingCategory: 0,
      noSeo: 0,
      lowScore: 0,
      needsReview: 0,
    };
    for (const p of products) {
      if (p.flags?.missingCategory) counts.missingCategory += 1;
      if (p.flags?.noSeo) counts.noSeo += 1;
      if (p.flags?.lowScore) counts.lowScore += 1;
      if (p.flags?.needsReview) counts.needsReview += 1;
    }
    return counts;
  }, [products]);

  const hasActiveFilters =
    debouncedSearch ||
    categoryFilter !== "all" ||
    supplierFilter !== "all" ||
    statusFilter !== "all" ||
    quickFilter !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Produkter
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {loading
              ? "Laster katalog…"
              : hasActiveFilters
                ? `${total.toLocaleString("no-NO")} produkter matcher filteret`
                : `${total.toLocaleString("no-NO")} produkter i katalogen`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/suppliers/import-queue"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Importkø
          </Link>
          <Link
            href="/admin/products/category-audit"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Kategorier
          </Link>
          <Link
            href="/admin/products/new"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={16} />
            Nytt produkt
          </Link>
        </div>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-800">
          Flere verktøy
        </summary>
        <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-3 pb-1">
          <Link
            href="/admin/products/pricing-audit"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            Priskontroll
          </Link>
          <Link
            href="/admin/products/variant-qa"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            Variantkontroll
          </Link>
          <Link
            href="/admin/suppliers"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            Leverandører
          </Link>
          <Link
            href="/admin/products/import"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            Hurtigimport (URL)
          </Link>
        </div>
      </details>

      {/* Sticky toolbar */}
      <div className="sticky top-0 z-20 -mx-1 space-y-3 border-b border-slate-200/80 bg-slate-50/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Søk tittel, SKU, slug eller leverandør…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-300 py-2 pl-10 pr-9 text-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Tøm søk"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
              >
                <option value="all">Alle kategorier</option>
                <option value="__none__">Uten kategori</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
              >
                <option value="all">Alle leverandører</option>
                <option value="cj">CJ</option>
                <option value="temu">Temu</option>
                <option value="alibaba">Alibaba</option>
                <option value="aliexpress">AliExpress</option>
                <option value="ebay">eBay</option>
                <option value="__none__">Ingen</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
              >
                <option value="all">Alle statuser</option>
                <option value="active">Aktive</option>
                <option value="inactive">Inaktive</option>
                <option value="archived">Arkiverte</option>
              </select>

              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} / side
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setQuickFilter(f.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  quickFilter === f.id
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {f.label}
                {f.id === "missing_category" && issueCounts.missingCategory > 0 && (
                  <span className="ml-1 opacity-80">({issueCounts.missingCategory})</span>
                )}
                {f.id === "no_seo" && issueCounts.noSeo > 0 && (
                  <span className="ml-1 opacity-80">({issueCounts.noSeo})</span>
                )}
                {f.id === "low_score" && issueCounts.lowScore > 0 && (
                  <span className="ml-1 opacity-80">({issueCounts.lowScore})</span>
                )}
                {f.id === "needs_review" && issueCounts.needsReview > 0 && (
                  <span className="ml-1 opacity-80">({issueCounts.needsReview})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk actions */}
        <div className="rounded-lg bg-white border border-gray-200 p-3 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
              <CheckSquare size={16} className="text-gray-400" />
              <span className="font-semibold text-gray-900">
                {selectedCount} valgt
              </span>
              <span className="text-xs text-gray-400">Ctrl+A = velg synlige</span>
              <button
                type="button"
                onClick={() => toggleSelectPage(true)}
                className="text-green-700 hover:underline text-xs"
              >
                Velg side
              </button>
              <button
                type="button"
                onClick={() => void selectAllFiltered()}
                className="text-green-700 hover:underline text-xs"
              >
                Velg filtrerte
              </button>
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-gray-500 hover:underline text-xs"
                >
                  Fjern valg
                </button>
              )}
              {selectMode === "filtered" && (
                <span className="text-xs text-gray-500">(filtrerte)</span>
              )}
            </div>

            {selectedCount > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={bulkLoading}
                  onClick={() => void runAiCategorize()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                  AI → Kategoriser
                </button>
                <button
                  type="button"
                  disabled={bulkLoading}
                  onClick={() => void runBulkAction("delete")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                  Slett valgte produkter
                </button>
                <button
                  type="button"
                  disabled={bulkLoading}
                  onClick={() => void runBulkAction("archive")}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  Arkiver
                </button>
                <button
                  type="button"
                  disabled={bulkLoading}
                  onClick={() => void runBulkAction("activate")}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Aktiver
                </button>
                <button
                  type="button"
                  disabled={bulkLoading}
                  onClick={() => void runBulkAction("deactivate")}
                  className="rounded-lg bg-slate-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Deaktiver
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <select
                value={bulkAction}
                onChange={(e) => setBulkAction(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white"
              >
                <option value="">Flere handlinger…</option>
                <option value="ai_categorize">AI → Kategoriser</option>
                <option value="move_category">Flytt kategori</option>
                <option value="change_supplier">Endre leverandør</option>
                <option value="generate_seo">Generer SEO på nytt</option>
                <option value="run_ai">Kjør AI på nytt</option>
              </select>

              {bulkAction === "move_category" && (
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white"
                >
                  <option value="">Velg kategori…</option>
                  {getAllDbValues().map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              )}

              {bulkAction === "change_supplier" && (
                <select
                  value={bulkSupplier}
                  onChange={(e) => setBulkSupplier(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white"
                >
                  <option value="temu">Temu</option>
                  <option value="alibaba">Alibaba</option>
                  <option value="ebay">eBay</option>
                  <option value="__none__">Ingen</option>
                </select>
              )}

              <button
                type="button"
                onClick={() => void runBulk()}
                disabled={bulkLoading || selectedCount === 0 || !bulkAction}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                Kjør
              </button>
            </div>
          </div>
        </div>
      </div>

      {!fetchError && (
        <div className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div>
            Viser{" "}
            {(products.length === 0
              ? 0
              : (page - 1) * pageSize + 1
            ).toLocaleString("no-NO")}
            –
            {products.length === 0
              ? 0
              : Math.min(page * pageSize, total).toLocaleString("no-NO")}{" "}
            av {total.toLocaleString("no-NO")}
            {hasActiveFilters ? " (filtrert)" : ""}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm hover:bg-white disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              Forrige
            </button>
            <span className="text-xs text-gray-500">
              Side {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm hover:bg-white disabled:opacity-40"
            >
              Neste
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {fetchError ? (
        <DataState
          status={
            fetchError.kind === "timeout"
              ? "timeout"
              : fetchError.kind === "network"
                ? "offline"
                : fetchError.kind === "database" || fetchError.kind === "quota"
                  ? "database"
                  : "api"
          }
          surface="products"
          error={fetchError}
          onRetry={() => void fetchProducts()}
        />
      ) : loading ? (
        <DataState status="loading" surface="products" />
      ) : products.length === 0 ? (
        <DataState status="empty" surface="products" onRetry={() => void fetchProducts()} />
      ) : (
        <ProductsTable
          products={products}
          categories={categories}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectPage={toggleSelectPage}
          onProductUpdated={fetchProducts}
          onAcceptSuggestion={acceptSuggestion}
        />
      )}

      {aiProgress && (
        <AiCategorizeProgressModal
          progress={aiProgress}
          onClose={() => setAiProgress(null)}
        />
      )}
    </div>
  );
}
