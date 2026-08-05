"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSmartPoll } from "@/lib/admin/useSmartPoll";
import { BuyerPublishMonitor } from "@/components/admin/BuyerPublishMonitor";
import type { BuyerPublishJobSnapshot } from "@/lib/buyer/publish-job-types";

type DeskStatus = {
  trafficLight: "running" | "waiting_api" | "stopped" | "idle";
  phase: string;
  phaseSteps: Array<{ id: string; label: string; state: "done" | "active" | "pending" }>;
  scanned: number;
  candidates: number;
  imported: number;
  published: number;
  productsPerMin: number | null;
  etaMinutes: number | null;
  nextStep: string;
  scanStatus: string | null;
  workerStatus: string;
  apiIssue: {
    title: string;
    body: string;
    detail: string | null;
    estimatedRestart: string | null;
  } | null;
  publishJob: BuyerPublishJobSnapshot | null;
  targetScanCount: number | null;
  workerHeartbeat?: string | null;
};

const LIGHT: Record<
  DeskStatus["trafficLight"],
  { label: string; className: string; dot: string }
> = {
  running: {
    label: "Kjører",
    className: "bg-emerald-50 text-emerald-900 border-emerald-200",
    dot: "bg-emerald-500",
  },
  waiting_api: {
    label: "Venter på API",
    className: "bg-amber-50 text-amber-950 border-amber-200",
    dot: "bg-amber-400",
  },
  stopped: {
    label: "Stoppet",
    className: "bg-rose-50 text-rose-900 border-rose-200",
    dot: "bg-rose-500",
  },
  idle: {
    label: "Klar",
    className: "bg-slate-50 text-slate-800 border-slate-200",
    dot: "bg-slate-400",
  },
};

/**
 * Rob's Desk — Digital Buyer at a glance (status, numbers, next action).
 */
export function DeskDigitalBuyerStatus() {
  const [status, setStatus] = useState<DeskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/buyer?view=desk_status");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && data.status) {
        setStatus(data.status as DeskStatus);
      }
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const live =
    status?.trafficLight === "running" ||
    status?.trafficLight === "waiting_api" ||
    status?.publishJob?.status === "running";

  useSmartPoll({
    tick: load,
    active: Boolean(live),
    activeMs: status?.publishJob?.status === "running" ? 2_500 : 5_000,
    idleMs: 30_000,
    enabled: true,
  });

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Leser Digital Buyer…
      </div>
    );
  }

  if (!status) return null;

  const light = LIGHT[status.trafficLight];
  const target = status.targetScanCount;
  const pct =
    target && target > 0
      ? Math.min(100, Math.round((status.scanned / target) * 100))
      : null;
  const pub = status.publishJob;
  const publishingLive = pub?.status === "running";
  const statusLabel = publishingLive
    ? "Publiserer"
    : pub?.status === "error"
      ? "Publisering stoppet"
      : light.label;

  return (
    <section
      id="desk-digital-buyer"
      className="space-y-3 rounded-2xl border border-emerald-200/80 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Digital Buyer
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                publishingLive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : light.className
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  publishingLive ? "bg-emerald-500" : light.dot
                }`}
              />
              {publishingLive ? `🟢 ${statusLabel}` : statusLabel}
            </span>
            {publishingLive && pub ? (
              <>
                <span className="text-xs tabular-nums text-slate-600">
                  {pub.processed.toLocaleString("no-NO")} /{" "}
                  {pub.totalProducts.toLocaleString("no-NO")}
                </span>
                {pub.productsPerMin != null ? (
                  <span className="text-xs tabular-nums text-slate-500">
                    {pub.productsPerMin} produkter/min
                  </span>
                ) : null}
                {pub.etaSeconds != null ? (
                  <span className="text-xs tabular-nums text-slate-500">
                    ETA ~{Math.max(1, Math.round(pub.etaSeconds / 60))} min
                  </span>
                ) : null}
              </>
            ) : (
              <>
                {status.productsPerMin != null ? (
                  <span className="text-xs tabular-nums text-slate-500">
                    {status.productsPerMin} produkter/min
                  </span>
                ) : null}
                {status.etaMinutes != null ? (
                  <span className="text-xs tabular-nums text-slate-500">
                    ~{status.etaMinutes} min igjen
                  </span>
                ) : null}
              </>
            )}
          </div>
        </div>
        <Link
          href="/admin/buyer"
          className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
        >
          Åpne Produktkjøper
        </Link>
      </div>

      {publishingLive && pub ? (
        <BuyerPublishMonitor
          job={pub}
          workerStatus={status.workerStatus}
          workerHeartbeat={status.workerHeartbeat ?? null}
          compact
        />
      ) : null}

      {status.apiIssue ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <p className="font-semibold">⚠ {status.apiIssue.title}</p>
          <p className="mt-1 text-amber-900/90">{status.apiIssue.body}</p>
          {status.apiIssue.estimatedRestart ? (
            <p className="mt-1 text-xs font-medium tabular-nums">
              Estimert restart: {status.apiIssue.estimatedRestart}
            </p>
          ) : null}
          {status.apiIssue.detail ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                className="text-xs font-semibold text-amber-900 underline"
              >
                {showDetail ? "Skjul detaljer" : "Vis detaljer"}
              </button>
              {showDetail ? (
                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-white/80 p-2 text-[11px] text-slate-700">
                  {status.apiIssue.detail}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {pct != null ? (
        <div>
          <p className="font-mono text-xs tabular-nums text-slate-700">
            {progressBar(pct)} {status.scanned.toLocaleString("no-NO")}
            {target != null
              ? ` / ${target.toLocaleString("no-NO")}`
              : ""}
          </p>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Analysert" value={status.scanned} />
        <Stat label="Kandidater" value={status.candidates} />
        <Stat label="Importert" value={status.imported} />
        <Stat label="Publisert" value={status.published} />
      </dl>

      <p className="text-sm text-slate-700">
        <span className="font-semibold text-slate-900">Neste steg:</span>{" "}
        {status.nextStep}
      </p>

      <ol className="space-y-1.5 text-sm">
        {status.phaseSteps.map((step) => (
          <li key={step.id} className="flex items-center gap-2 text-slate-700">
            <span className="w-4 shrink-0 text-center">
              {step.state === "done"
                ? "✓"
                : step.state === "active"
                  ? "▶"
                  : "○"}
            </span>
            <span
              className={
                step.state === "active"
                  ? "font-semibold text-emerald-900"
                  : step.state === "done"
                    ? "text-slate-600"
                    : "text-slate-400"
              }
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      {status.publishJob ? (
        <BuyerPublishMonitor
          job={status.publishJob}
          workerStatus={status.workerStatus}
          workerHeartbeat={status.workerHeartbeat ?? null}
        />
      ) : (
        <BuyerPublishMonitor
          job={null}
          workerStatus={status.workerStatus}
          workerHeartbeat={status.workerHeartbeat ?? null}
        />
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-lg font-semibold tabular-nums text-slate-900">
        {value.toLocaleString("no-NO")}
      </dd>
    </div>
  );
}

function progressBar(pct: number): string {
  const filled = Math.max(0, Math.min(12, Math.round((pct / 100) * 12)));
  return `${"█".repeat(filled)}${"░".repeat(12 - filled)}`;
}
