"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  Loader2,
  Eye,
  Check,
  Upload,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { SupplierEngineTabs } from "@/components/admin/supplier/SupplierEngineTabs";
import { PipelineStepper } from "@/components/admin/supplier/PipelineStepper";
import { ScoreBar, StatusBadge } from "@/components/admin/supplier/StatusBadge";
import { DataState } from "@/components/admin/DataState";
import {
  classifyAdminError,
  type AdminDataError,
} from "@/lib/admin/data-errors";
import {
  PIPELINE_BUCKETS,
  PIPELINE_BUCKET_LABELS,
  type PipelineBucket,
} from "@/lib/ops/pipeline-status";
import { useSmartPoll } from "@/lib/admin/useSmartPoll";
import { presentImportError } from "@/lib/ops/import-failure-reasons";

type QueueItem = {
  id: string;
  supplier: string;
  supplierProductId: string;
  title: string | null;
  imageUrl: string | null;
  status: string;
  error: string | null;
  reviewReason: string | null;
  autoApproved: boolean;
  productId: string | null;
  supplierPrice: number | null;
  supplierCurrency: string | null;
  createdAt: string;
  enrichment?: { aiGenerated?: boolean; warning?: string | null } | null;
  completeness?: { score?: number; requiresReview?: boolean; summary?: string } | null;
  pricing?: { recommendedSalePrice?: number; marginPct?: number } | null;
};

type PipelineCounts = Record<PipelineBucket, number> & {
  total: number;
  awaitingAdmin: number;
  inPipeline: number;
};

const BUCKET_FILTER: Record<PipelineBucket, string> = {
  queued: "queued",
  importing: "processing",
  ai_analyzing: "enriching",
  review: "review",
  ready_publish: "approved",
  published: "published",
  failed: "failed",
};

const CARD_TONE: Record<PipelineBucket, string> = {
  queued: "border-slate-200 bg-white",
  importing: "border-indigo-200 bg-indigo-50/60",
  ai_analyzing: "border-violet-200 bg-violet-50/60",
  review: "border-amber-200 bg-amber-50/70",
  ready_publish: "border-emerald-200 bg-emerald-50/60",
  published: "border-emerald-300 bg-emerald-50/40",
  failed: "border-red-200 bg-red-50/70",
};

const FILTERS = [
  { id: "all", label: "Alle" },
  { id: "queued", label: "I kø" },
  { id: "processing", label: "Importeres" },
  { id: "enriching", label: "AI analyserer" },
  { id: "review", label: "Review" },
  { id: "approved", label: "Klar for publisering" },
  { id: "published", label: "Publisert" },
  { id: "failed", label: "Feilet" },
] as const;

export default function ImportQueueClient() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") || "all";
  const [status, setStatus] = useState<string>(initialStatus);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pipeline, setPipeline] = useState<PipelineCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<AdminDataError | null>(null);
  const [loadedOk, setLoadedOk] = useState(false);

  const loadPipeline = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/truth?scope=pipeline");
      const data = await res.json();
      if (res.ok && data?.ok && data.pipeline) {
        setPipeline(data.pipeline as PipelineCounts);
      }
    } catch {
      /* keep last */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw Object.assign(new Error("offline"), { status: 0 });
      }
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/admin/import-queue?${params}`, {
        signal: ac.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw Object.assign(new Error(data?.error || "Kunne ikke hente kø"), {
          status: res.status,
        });
      }
      setItems(data.data || []);
      setCounts(data.counts || {});
      setSelected(new Set());
      setLoadedOk(true);
      setLoadError(null);
    } catch (e: unknown) {
      const statusCode =
        e && typeof e === "object" && "status" in e
          ? Number((e as { status: unknown }).status)
          : (e as { name?: string })?.name === "AbortError"
            ? 408
            : undefined;
      const err = classifyAdminError(e, statusCode);
      setLoadError(err);
      setLoadedOk(false);
      setItems([]);
      console.error("[import-queue]", err.logMessage);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPipeline();
  }, [loadPipeline]);

  const pipelineActive =
    (pipeline?.inPipeline || 0) > 0 || (pipeline?.awaitingAdmin || 0) > 0;

  useSmartPoll({
    tick: loadPipeline,
    active: pipelineActive,
    activeMs: 5_000,
    idleMs: 45_000,
    enabled: true,
  });

  const runAction = async (
    action: "process" | "approve" | "publish" | "process_all" | "remove",
    ids?: string[]
  ) => {
    const targetIds = ids ?? Array.from(selected);
    if (action !== "process_all" && targetIds.length === 0) {
      toast.error("Velg minst ett element");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/import-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "process_all"
            ? { action, limit: 10 }
            : { action, ids: targetIds }
        ),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Handling feilet");
      toast.success("Oppdatert");
      await Promise.all([load(), loadPipeline()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  };

  const removeOne = async (id: string) => {
    if (!confirm("Fjern dette elementet fra køen?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/import-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", ids: [id] }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Kunne ikke fjerne");
      toast.success("Fjernet");
      await Promise.all([load(), loadPipeline()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBusy(false);
    }
  };

  const cardCount = (bucket: PipelineBucket) =>
    pipeline?.[bucket] ?? counts[BUCKET_FILTER[bucket]] ?? null;

  return (
    <div className="space-y-5">
      <SupplierEngineTabs />
      <PipelineStepper current="queue" />

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Importstatus</h2>
          <span className="text-[11px] text-slate-500">
            Live · oppdateres hvert 4. sekund
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {PIPELINE_BUCKETS.map((bucket) => {
            const n = cardCount(bucket);
            return (
              <button
                key={bucket}
                type="button"
                onClick={() => setStatus(BUCKET_FILTER[bucket])}
                className={`rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md ${CARD_TONE[bucket]} ${
                  status === BUCKET_FILTER[bucket] ? "ring-2 ring-slate-900" : ""
                }`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {PIPELINE_BUCKET_LABELS[bucket]}
                </div>
                <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                  {n == null ? "…" : n.toLocaleString("no-NO")}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatus(f.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              status === f.id
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label}
            {f.id !== "all" && counts[f.id] != null ? ` (${counts[f.id]})` : ""}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAction("process_all")}
          className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Behandle kø (10)
        </button>
        <button
          type="button"
          disabled={busy || items.length === 0}
          onClick={() => {
            setSelected(new Set(items.map((i) => i.id)));
            void runAction(
              "approve",
              items.map((i) => i.id)
            );
          }}
          className="inline-flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Check size={14} /> Godkjenn alle
        </button>
        <button
          type="button"
          disabled={busy || items.length === 0}
          onClick={() =>
            void runAction(
              "publish",
              items.map((i) => i.id)
            )
          }
          className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Upload size={14} /> Publiser alle
        </button>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => void runAction("approve")}
          className="inline-flex items-center gap-1 rounded-xl bg-amber-500/90 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Check size={14} /> Godkjenn valgte
        </button>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => void runAction("publish")}
          className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Upload size={14} /> Publiser valgte
        </button>
        <button
          type="button"
          disabled={busy || items.length === 0}
          onClick={() => {
            const scored = items
              .filter((i) => (i.completeness?.score ?? 0) >= 70)
              .map((i) => i.id);
            setSelected(new Set(scored));
            toast.success(`Valgte ${scored.length} med score ≥70`);
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
        >
          Velg etter score ≥70
        </button>
        <button
          type="button"
          disabled={busy || items.length === 0}
          onClick={() => {
            const supplier = window.prompt("Velg leverandør (delvis match):", "cj");
            if (!supplier) return;
            const hit = items
              .filter((i) =>
                i.supplier.toLowerCase().includes(supplier.toLowerCase())
              )
              .map((i) => i.id);
            setSelected(new Set(hit));
            toast.success(`Valgte ${hit.length}`);
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
        >
          Velg etter kategori/leverandør
        </button>
        <button
          type="button"
          disabled={busy || items.length === 0}
          onClick={() => {
            const days = Number(window.prompt("Velg siste N dager:", "7") || "");
            if (!Number.isFinite(days) || days <= 0) return;
            const cut = Date.now() - days * 86400000;
            const hit = items
              .filter((i) => new Date(i.createdAt).getTime() >= cut)
              .map((i) => i.id);
            setSelected(new Set(hit));
            toast.success(`Valgte ${hit.length} fra siste ${days} dager`);
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
        >
          Velg etter dato
        </button>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => void runAction("remove")}
          className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
        >
          <Trash2 size={14} /> Fjern
        </button>
      </div>

      {loading && !loadedOk ? (
        <DataState state="loading" surface="importQueue" />
      ) : loadError && !loadedOk ? (
        <DataState
          state={loadError.kind === "network" ? "offline" : "error"}
          surface="importQueue"
          error={loadError}
          onRetry={() => void load()}
        />
      ) : items.length === 0 ? (
        <DataState
          state="empty"
          surface="importQueue"
          onRetry={() => void load()}
          actions={
            <Link
              href="/admin/suppliers"
              className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white"
            >
              Åpne leverandører
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const score = item.completeness?.score ?? 0;
            const aiWarning = item.enrichment?.warning || null;
            const checked = selected.has(item.id);
            return (
              <article
                key={item.id}
                className={`flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row ${
                  checked ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200"
                }`}
              >
                <div className="flex gap-3 sm:w-72 sm:shrink-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    }}
                    className="mt-1"
                  />
                  <div className="h-20 w-20 overflow-hidden rounded-xl bg-slate-100">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">
                      {item.title || item.supplierProductId}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.supplier} ·{" "}
                      {item.supplierPrice != null
                        ? `${item.supplierPrice} ${item.supplierCurrency || ""}`
                        : "—"}
                    </p>
                    <div className="mt-2">
                      <StatusBadge status={item.status} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <ScoreBar score={score} />
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          item.autoApproved
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.autoApproved ? "Auto-godkjent" : "Manuell review"}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                        AI:{" "}
                        {item.enrichment?.aiGenerated
                          ? "Generert"
                          : aiWarning
                            ? "Fallback"
                            : "—"}
                      </span>
                      {item.pricing?.recommendedSalePrice != null ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">
                          Anbefalt {item.pricing.recommendedSalePrice} NOK
                        </span>
                      ) : null}
                    </div>
                    {(item.error || aiWarning || item.reviewReason) && (
                      <div className="flex items-start gap-1 text-xs text-amber-900">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-700" />
                        {item.error ? (
                          <div className="min-w-0 space-y-0.5">
                            {(() => {
                              const err = presentImportError(item.error, {
                                title: item.title,
                                supplierProductId: item.supplierProductId,
                              });
                              return (
                                <>
                                  <p className="font-semibold text-amber-950">{err.title}</p>
                                  {err.productHint ? (
                                    <p className="text-amber-800/90">Produkt: {err.productHint}</p>
                                  ) : null}
                                  <p className="text-amber-800/90">Årsak: {err.reason}</p>
                                  <p className="text-amber-800/90">Handling: {err.action}</p>
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="line-clamp-2">{aiWarning || item.reviewReason}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Link
                      href={`/admin/suppliers/import-queue/${item.id}/preview`}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      <Eye size={12} /> Preview
                    </Link>
                    {(item.status === "queued" || item.status === "failed") && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction("process", [item.id])}
                        className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Behandle
                      </button>
                    )}
                    {(item.status === "review" || item.status === "approved") && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void runAction(
                            item.status === "review" ? "approve" : "publish",
                            [item.id]
                          )
                        }
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {item.status === "review" ? "Godkjenn" : "Publiser"}
                      </button>
                    )}
                    {item.status === "approved" ? null : item.status === "review" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const res = await fetch("/api/admin/import-queue", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "publish",
                                ids: [item.id],
                              }),
                            });
                            const data = await res.json();
                            if (!res.ok || !data?.ok) {
                              // need approve first typically
                              await fetch("/api/admin/import-queue", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  action: "approve",
                                  ids: [item.id],
                                }),
                              });
                              const res2 = await fetch("/api/admin/import-queue", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  action: "publish",
                                  ids: [item.id],
                                }),
                              });
                              const data2 = await res2.json();
                              if (!res2.ok || !data2?.ok) {
                                throw new Error(data2?.error || data?.error || "Publiser feilet");
                              }
                            }
                            toast.success("Publisert");
                            await load();
                          } catch (e: unknown) {
                            toast.error(e instanceof Error ? e.message : "Feil");
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Publiser
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeOne(item.id)}
                      className="inline-flex items-center gap-1 rounded-xl border border-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 size={12} /> Fjern
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
