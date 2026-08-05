"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { getAllDbValues } from "@/lib/categories";
import { RebuildCategoriesButton } from "@/components/admin/RobsDeskActions";

type AuditItem = {
  productId: string;
  name: string;
  slug: string;
  currentCategory: string | null;
  suggestedCategory: string | null;
  confidence: number | null;
  reason: string | null;
  status: string | null;
};

type Counts = {
  pending: number;
  needs_review: number;
  applied: number;
  corrected: number;
};

export default function CategoryAuditClient() {
  const [tab, setTab] = useState<"pending" | "needs_review">("pending");
  const [items, setItems] = useState<AuditItem[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/products/category-audit?status=${tab}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Kunne ikke hente");
      setItems(data.items || []);
      setCounts(data.counts || null);
      setSelected(new Set());
      setOverrides({});
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => getAllDbValues(), []);

  const approve = async (allPending?: boolean) => {
    setBusy(true);
    try {
      let body: Record<string, unknown>;
      if (allPending) {
        if (!confirm("Godkjenne alle ventende AI-kategorier?")) return;
        body = { action: "approve_all_pending" };
      } else {
        const ids = Array.from(selected);
        if (ids.length === 0) {
          toast.error("Velg produkter");
          return;
        }
        body = {
          action: "approve",
          items: ids.map((productId) => ({
            productId,
            category: overrides[productId] || undefined,
          })),
        };
      }
      const res = await fetch("/api/admin/products/category-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Feil");
      toast.success(data.message);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/products/category-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", productIds: ids }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Feil");
      toast.success(data.message);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin/products" className="text-sm text-gray-500 hover:text-gray-800">
            ← Produkter
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
            AI-kategori godkjenning
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Confidence under 90 % havner i «Trenger review» (provisional kategori er satt).
            ≥ 90 % anvendes automatisk. Funksjon slår markedsføring (f.eks. Gaming Phone Case → Mobil).
            Endringer du gjør læres for fremtidig AI.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <RebuildCategoriesButton />
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            <RefreshCw size={14} />
            Oppdater kø
          </button>
        </div>
      </div>

      {counts && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Venter godkjenning" value={counts.pending} hot />
          <Stat label="Trenger review" value={counts.needs_review} warn />
          <Stat label="Anvendt" value={counts.applied} />
          <Stat label="Korrigert av Rob" value={counts.corrected} />
        </div>
      )}

      <div className="flex gap-2">
        <Tab
          active={tab === "pending"}
          onClick={() => setTab("pending")}
          label={`Godkjenningsliste (${counts?.pending ?? "…"})`}
        />
        <Tab
          active={tab === "needs_review"}
          onClick={() => setTab("needs_review")}
          label={`Trenger review (${counts?.needs_review ?? "…"})`}
        />
      </div>

      {tab === "pending" && items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setSelected(new Set(items.map((i) => i.productId)))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium"
          >
            Velg alle
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void approve(false)}
            className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Check size={14} />
            Godkjenn valgte ({selected.size})
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void approve(true)}
            className="rounded-lg border border-green-600 px-3 py-1.5 text-xs font-semibold text-green-700 disabled:opacity-50"
          >
            Godkjenn alle
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void dismiss()}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <X size={14} />
            Avvis valgte
          </button>
        </div>
      )}

      {tab === "needs_review" && items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setSelected(new Set(items.map((i) => i.productId)))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium"
          >
            Velg alle
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void approve(false)}
            className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Check size={14} />
            Sett kategori for valgte
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void dismiss()}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <X size={14} />
            Avvis
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-xl border bg-white">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          Ingen produkter i denne køen.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Produkt</th>
                  <th className="px-3 py-2">Nå</th>
                  <th className="px-3 py-2">AI-forslag</th>
                  <th className="px-3 py-2">Confidence</th>
                  <th className="px-3 py-2">Begrunnelse</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.productId} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(item.productId)}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.productId)) next.delete(item.productId);
                            else next.add(item.productId);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/products/edit/${item.productId}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {item.currentCategory || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={
                          overrides[item.productId] ||
                          item.suggestedCategory ||
                          ""
                        }
                        onChange={(e) =>
                          setOverrides((prev) => ({
                            ...prev,
                            [item.productId]: e.target.value,
                          }))
                        }
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option value="">Velg…</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {item.confidence != null ? `${item.confidence} %` : "—"}
                    </td>
                    <td className="max-w-sm px-3 py-2 text-xs text-gray-600">
                      {item.reason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hot,
  warn,
}: {
  label: string;
  value: number;
  hot?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-3 shadow-sm ${
        warn ? "border-amber-200" : hot ? "border-green-200" : "border-gray-200"
      }`}
    >
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`mt-1 text-xl font-bold ${
          warn ? "text-amber-800" : hot ? "text-green-800" : "text-gray-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Tab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
        active ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}
