"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, Search, ShoppingBag, ArrowRight } from "lucide-react";
import { DeskBuyerV4 } from "@/components/admin/DeskBuyerV4";
import { DeskBuyerMissions } from "@/components/admin/DeskBuyerMissions";
import { DeskWidgetBoundary } from "@/components/admin/DeskWidgetBoundary";
import { BuyerPickFlow } from "@/components/admin/BuyerPickFlow";
import { BuyerProductHunt } from "@/components/admin/BuyerProductHunt";
import { BuyerHuntLiveStatus } from "@/components/admin/BuyerHuntLiveStatus";
import { BuyerRepublishSection } from "@/components/admin/BuyerRepublishSection";
import { AiMissionControl } from "@/components/admin/AiMissionControl";
import { BuyerPreferencesPanel } from "@/components/admin/BuyerPreferencesPanel";
import { BuyerAssortmentStrategyPanel } from "@/components/admin/BuyerAssortmentStrategyPanel";
import { BuyerProductFocusPanel } from "@/components/admin/BuyerProductFocusPanel";
import { DataState } from "@/components/admin/DataState";
import {
  classifyAdminError,
  type AdminDataError,
} from "@/lib/admin/data-errors";
import { useSmartPoll } from "@/lib/admin/useSmartPoll";

type Scan = {
  id: string;
  status: string;
  targetScanCount: number;
  scanned: number;
  kept: number;
  filtered: number;
  finishedAt: string | null;
  error: string | null;
  startedAt?: string | null;
};

type Ops = {
  scanned?: number;
  kept?: number;
  filtered?: number;
  target?: number;
  targetKept?: number | null;
  productsPerMin?: number | null;
};

/**
 * Produktkjøper — Finn produkter → Velg → Publiser. Avansert under detaljer.
 */
export default function BuyerClient() {
  const [scan, setScan] = useState<Scan | null>(null);
  const [ops, setOps] = useState<Ops | null>(null);
  const [rankedCount, setRankedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<AdminDataError | null>(null);
  const [loadedOk, setLoadedOk] = useState(false);
  const [missionOpen, setMissionOpen] = useState(false);
  const missionDetailsRef = useRef<HTMLDetailsElement>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const q = opts?.silent ? "?poll=1" : "";
      const res = await fetch(`/api/admin/buyer${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw Object.assign(new Error(data?.error || "Feil"), {
          status: res.status,
        });
      }
      setScan(data.scan);
      setOps(data.ops || null);
      setRankedCount(Number(data.stats?.rankedCount || 0));
      setLoadedOk(true);
      setLoadError(null);
    } catch (e: unknown) {
      if (!opts?.silent) {
        const status =
          e && typeof e === "object" && "status" in e
            ? Number((e as { status: unknown }).status)
            : undefined;
        const err = classifyAdminError(e, status);
        setLoadError(err);
        setLoadedOk(false);
        console.error("[buyer]", err.logMessage);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const openFromHash = () => {
      if (typeof window === "undefined") return;
      if (window.location.hash !== "#ai-mission-control") return;
      setMissionOpen(true);
      requestAnimationFrame(() => {
        missionDetailsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  const running =
    scan?.status === "running" ||
    scan?.status === "queued" ||
    scan?.status === "paused";

  const huntLive = scan?.status === "running" || scan?.status === "queued";

  const pollSilent = useCallback(() => load({ silent: true }), [load]);
  useSmartPoll({
    tick: pollSilent,
    active: running,
    activeMs: 5_000,
    idleMs: null,
    enabled: running,
  });

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast.error(
          classifyAdminError(data?.error || "Feil", res.status).reason
        );
        return;
      }
      toast.success("OK");
      await load();
      return data;
    } catch (e: unknown) {
      toast.error(classifyAdminError(e).reason);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !loadedOk) {
    return <DataState state="loading" surface="buyer" />;
  }

  if (loadError && !loadedOk) {
    return (
      <DataState
        state={loadError.kind === "network" ? "offline" : "error"}
        surface="buyer"
        error={loadError}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <DeskWidgetBoundary name="Buyer product hunt">
        <BuyerProductHunt
          scan={scan}
          ops={ops}
          busy={busy}
          onChanged={() => load({ silent: true })}
        />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Buyer hunt live status">
        <BuyerHuntLiveStatus live={huntLive} />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Buyer pick flow">
        <Suspense
          fallback={
            <div className="flex justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
            </div>
          }
        >
          <BuyerPickFlow liveRefresh={huntLive} />
        </Suspense>
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Republish candidates">
        <BuyerRepublishSection />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="AI Mission Control">
        <details
          id="ai-mission-control"
          ref={missionDetailsRef}
          className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm"
          open={missionOpen}
          onToggle={(e) => {
            setMissionOpen((e.target as HTMLDetailsElement).open);
          }}
        >
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-slate-800">
            AI Mission Control · diagnose & observasjon
            <span className="ml-2 font-normal text-slate-500">
              read-only · påvirker ikke AI
            </span>
          </summary>
          <div className="border-t border-slate-100 px-3 py-4 sm:px-5">
            {missionOpen ? <AiMissionControl live={huntLive} /> : null}
          </div>
        </details>
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Buyer preferences">
        <BuyerPreferencesPanel />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Buyer assortment strategy">
        <BuyerAssortmentStrategyPanel />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Buyer product focus">
        <BuyerProductFocusPanel />
      </DeskWidgetBoundary>

      <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-slate-800">
          Avansert · høyvolum-review
          {rankedCount > 0
            ? ` · ${rankedCount.toLocaleString("no-NO")} rangert`
            : ""}
        </summary>
        <div className="border-t border-slate-100 px-3 py-4 sm:px-5">
          <DeskWidgetBoundary name="Buyer review board">
            <Suspense
              fallback={
                <div className="flex justify-center py-10">
                  <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
                </div>
              }
            >
              <DeskBuyerV4 scanStatus={scan?.status ?? null} />
            </Suspense>
          </DeskWidgetBoundary>
        </div>
      </details>

      <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-slate-800">
          Avansert · kategorioppdrag & operasjon
          {scan ? (
            <span className="ml-2 font-normal text-slate-500">
              · siste scan {scan.status}
            </span>
          ) : null}
        </summary>
        <div className="space-y-4 border-t border-slate-100 px-5 py-4">
          <DeskWidgetBoundary name="AI category missions">
            <DeskBuyerMissions />
          </DeskWidgetBoundary>

          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Ekspertverktøy
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Kun hvis køen henger. Vanlig flyt er «Finn produkter» øverst.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {([100, 1000, 10000] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void post({
                      action: "start_scan",
                      targetScanCount: n,
                      processInline: n <= 100,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Rå-scan {n.toLocaleString("no-NO")}
                </button>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => void post({ action: "drain_workers" })}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
              >
                Behandle kø
              </button>
              <button
                type="button"
                disabled={busy || rankedCount === 0}
                onClick={() => void post({ action: "import_top", limit: 100 })}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <ShoppingBag className="h-4 w-4" />
                Klargjør topp 100
              </button>
              <Link
                href="/admin/suppliers/import-queue"
                className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-900"
              >
                Importkø / review <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {scan && (
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <MiniStat label="Status" value={scan.status} />
                <MiniStat
                  label="Scannet"
                  value={`${scan.scanned.toLocaleString("no-NO")} / ${scan.targetScanCount.toLocaleString("no-NO")}`}
                />
                <MiniStat label="Beholdt" value={String(scan.kept)} />
                <MiniStat label="Filtrert" value={String(scan.filtered)} />
              </div>
            )}
            {scan?.error && (
              <p className="mt-2 text-sm text-rose-700">{scan.error}</p>
            )}
          </section>
        </div>
      </details>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
