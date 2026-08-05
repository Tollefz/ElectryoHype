"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, PackageSearch, Download, ArrowRight } from "lucide-react";
import { SupplierEngineTabs } from "@/components/admin/supplier/SupplierEngineTabs";
import { PipelineStepper } from "@/components/admin/supplier/PipelineStepper";
import { ScoreBar } from "@/components/admin/supplier/StatusBadge";

type SearchProduct = {
  id: string;
  sku: string | null;
  title: string;
  imageUrl: string | null;
  price: number;
  currency: string;
  category: string | null;
  rating: number | null;
  stock: number | null;
  deliveryTime: string | null;
  weightGrams: number | null;
  variantCount: number;
  warehouse: string | null;
  listedCount: number | null;
};

function estimateCompleteness(p: SearchProduct): number {
  let score = 40;
  if (p.imageUrl) score += 15;
  if (p.price > 0) score += 15;
  if (p.stock != null) score += 10;
  if (p.category) score += 5;
  if (p.variantCount > 0) score += 10;
  if (p.deliveryTime) score += 5;
  return Math.min(95, score);
}

function toastImported(message: string) {
  toast.success(
    (t) => (
      <span className="text-sm">
        {message}{" "}
        <a
          href="/admin/suppliers/import-queue"
          className="font-semibold underline"
          onClick={() => toast.dismiss(t.id)}
        >
          Åpne importkø →
        </a>
      </span>
    ),
    { duration: 10_000 }
  );
}

export default function SupplierCatalogClient({
  supplierId,
  displayName,
}: {
  supplierId: string;
  displayName: string;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [query, setQuery] = useState("Gaming Mouse");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [minStock, setMinStock] = useState("");
  const [sortBy, setSortBy] = useState("bestsellers");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [products, setProducts] = useState<SearchProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [lastImportCount, setLastImportCount] = useState(0);
  const autoStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Don't leave the page stuck on a blank/spinner if meta is slow.
    const fallback = setTimeout(() => {
      if (!cancelled) setConfigured((c) => (c === null ? true : c));
    }, 2500);

    void (async () => {
      try {
        const res = await fetch("/api/admin/suppliers/search?meta=1");
        const data = await res.json().catch(() => null);
        const row = data?.suppliers?.find((s: { id: string }) => s.id === supplierId);
        if (!cancelled) setConfigured(Boolean(row?.configured));
      } catch {
        // Let search reveal configuration errors.
        if (!cancelled) setConfigured(true);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, [supplierId]);

  const runSearch = useCallback(
    async (pageNum = 1) => {
      setLoading(true);
      setError(null);
      setSearched(true);
      try {
        const params = new URLSearchParams();
        params.set("supplier", supplierId);
        params.set("q", query);
        params.set("page", String(pageNum));
        params.set("pageSize", "20");
        params.set("sortBy", sortBy);
        if (minPrice) params.set("minPrice", minPrice);
        if (maxPrice) params.set("maxPrice", maxPrice);
        if (warehouse) params.set("warehouse", warehouse);
        if (minStock) params.set("minStock", minStock);

        const res = await fetch(`/api/admin/suppliers/search?${params}`);
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "Søk feilet");
        }
        setProducts(data.products || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setPage(data.page || pageNum);
        setSelected(new Set());
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Søk feilet");
        setProducts([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    },
    [supplierId, query, minPrice, maxPrice, warehouse, minStock, sortBy]
  );

  // Auto-search as soon as we know the supplier is configured (or assume true on meta failure).
  useEffect(() => {
    if (configured !== true || autoStarted.current) return;
    autoStarted.current = true;
    void runSearch(1);
  }, [configured, runSearch]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const importIds = async (ids: string[], processNow: boolean) => {
    if (ids.length === 0) {
      toast.error("Velg minst ett produkt");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/admin/suppliers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: supplierId,
          ids,
          processNow,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Import feilet");
      const count = Number(data.imported || ids.length);
      setLastImportCount(count);
      toastImported(data.message || `${count} lagt i importkø`);
      setSelected(new Set());
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Import feilet");
    } finally {
      setImporting(false);
    }
  };

  if (configured === false) {
    return (
      <div className="space-y-4">
        <SupplierEngineTabs />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <PackageSearch className="mx-auto text-amber-700" size={40} />
          <h2 className="mt-3 text-lg font-semibold text-amber-950">
            {displayName} er ikke konfigurert
          </h2>
          <p className="mt-2 text-sm text-amber-900">
            Be en utvikler om å aktivere API-nøkkel, eller åpne Innstillinger.
          </p>
          <Link
            href="/admin/suppliers/settings"
            className="mt-4 inline-flex rounded-xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Åpne innstillinger
          </Link>
        </div>
      </div>
    );
  }

  const showSpinner = loading && products.length === 0;
  const showEmpty = !loading && searched && products.length === 0 && !error;
  const showIdle = !loading && !searched && products.length === 0;

  return (
    <div className="space-y-5">
      <SupplierEngineTabs />
      <PipelineStepper current="search" />

      {lastImportCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-medium text-emerald-950">
            {lastImportCount} produkt{lastImportCount === 1 ? "" : "er"} i importkø.
            Neste steg: Preview → Review → Publiser.
          </p>
          <Link
            href="/admin/suppliers/import-queue"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Åpne importkø <ArrowRight size={14} />
          </Link>
        </div>
      ) : null}

      <form
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(1);
        }}
      >
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Søk i ${displayName}…`}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            Søk produkter
          </button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Min pris"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Maks pris"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            placeholder="Lager (CN, US…)"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            placeholder="Min. lager"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="bestsellers">Bestselgere</option>
            <option value="newest">Nyeste</option>
            <option value="price_asc">Pris ↑</option>
            <option value="price_desc">Pris ↓</option>
            <option value="stock">Lager</option>
            <option value="relevance">Relevans</option>
          </select>
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">Søk feilet</p>
          <p className="mt-1">{error}</p>
          <button
            type="button"
            onClick={() => void runSearch(1)}
            className="mt-2 text-sm font-semibold underline"
          >
            Prøv igjen
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 shadow-md">
          <span className="text-sm font-semibold text-emerald-950">
            {selected.size} valgt
          </span>
          <button
            type="button"
            disabled={importing}
            onClick={() => void importIds(Array.from(selected), false)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Download size={14} />
            Importer til kø
          </button>
          <button
            type="button"
            disabled={importing}
            onClick={() => void importIds(Array.from(selected), true)}
            className="rounded-xl bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Importer + behandle nå
          </button>
          <Link
            href="/admin/suppliers/import-queue"
            className="ml-auto text-sm font-semibold text-emerald-800 underline"
          >
            Åpne importkø →
          </Link>
        </div>
      )}

      {showSpinner || configured === null ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white">
          <Loader2 className="animate-spin text-emerald-600" size={28} />
          <p className="text-sm text-slate-600">Henter produkter fra {displayName}…</p>
        </div>
      ) : showIdle ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <PackageSearch className="mx-auto text-slate-400" size={40} />
          <h3 className="mt-3 text-lg font-semibold text-slate-900">Klar til søk</h3>
          <p className="mt-1 text-sm text-slate-600">
            Skriv et søkeord og trykk «Søk produkter».
          </p>
        </div>
      ) : showEmpty ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <PackageSearch className="mx-auto text-slate-400" size={40} />
          <h3 className="mt-3 text-lg font-semibold text-slate-900">Ingen treff</h3>
          <p className="mt-1 text-sm text-slate-600">
            Prøv et annet søkeord, eller fjern filtre.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => {
            const score = estimateCompleteness(p);
            const checked = selected.has(p.id);
            return (
              <article
                key={p.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
                  checked ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200"
                }`}
              >
                <div className="relative aspect-[4/3] bg-slate-100">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
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
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4"
                    />
                  </label>
                </div>
                <div className="space-y-2 p-4">
                  <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">
                    {p.title}
                  </h3>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">
                      {p.price.toFixed(2)} {p.currency}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">
                      Lager {p.stock ?? "—"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">
                      {p.variantCount || 0} var.
                    </span>
                    {p.deliveryTime ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">
                        {p.deliveryTime}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500">{p.category || "Uten kategori"}</p>
                  <ScoreBar score={score} size="sm" />
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => void importIds([p.id], false)}
                    className="mt-1 w-full rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Importer
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {products.length > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            {total.toLocaleString("no-NO")} treff — side {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => void runSearch(page - 1)}
              className="rounded-xl border px-3 py-1.5 disabled:opacity-40"
            >
              Forrige
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => void runSearch(page + 1)}
              className="rounded-xl border px-3 py-1.5 disabled:opacity-40"
            >
              Neste
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
