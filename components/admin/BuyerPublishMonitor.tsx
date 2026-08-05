"use client";

import type { BuyerPublishJobSnapshot } from "@/lib/buyer/publish-job-types";

function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} t ${rm} min` : `${h} t`;
}

type Props = {
  job: BuyerPublishJobSnapshot | null;
  workerStatus?: string | null;
  workerHeartbeat?: string | null;
  onResume?: () => void;
  resumeBusy?: boolean;
  compact?: boolean;
};

/**
 * Compact Publish Monitor — Desk / pick flow status strip.
 */
export function BuyerPublishMonitor({
  job,
  workerStatus,
  workerHeartbeat,
  onResume,
  resumeBusy,
  compact,
}: Props) {
  const monitorStatus = !job
    ? "Idle"
    : job.status === "error"
      ? "Failed"
      : job.status === "done"
        ? "Idle"
        : job.stalled
          ? "Stalled"
          : "Running";

  if (compact && job?.status === "running") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-950">
        <p className="font-semibold">
          🟢 Publiserer{" "}
          <span className="tabular-nums">
            {job.processed.toLocaleString("no-NO")} /{" "}
            {job.totalProducts.toLocaleString("no-NO")}
          </span>
        </p>
        <p className="mt-0.5 text-xs tabular-nums text-emerald-900/80">
          {job.productsPerMin != null
            ? `${job.productsPerMin} produkter/min`
            : "Starter…"}
          {job.etaSeconds != null
            ? ` · ETA ${fmtDuration(job.etaSeconds)}`
            : ""}
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Publish Monitor
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
        <Item label="Status" value={monitorStatus} />
        <Item label="Job ID" value={job?.id || "—"} mono />
        <Item
          label="Batch"
          value={
            job
              ? `${job.currentBatch} / ${job.totalBatches ?? job.batchTotal}`
              : "—"
          }
        />
        <Item
          label="Publisert"
          value={job ? job.published.toLocaleString("no-NO") : "0"}
        />
        <Item
          label="Feilet"
          value={job ? job.failed.toLocaleString("no-NO") : "0"}
        />
        <Item
          label="Produkter/min"
          value={
            job?.productsPerMin != null ? String(job.productsPerMin) : "—"
          }
        />
        <Item label="ETA" value={fmtDuration(job?.etaSeconds)} />
        <Item
          label="Sist oppdatert"
          value={
            job?.updatedAt
              ? new Date(job.updatedAt).toLocaleTimeString("no-NO")
              : "—"
          }
        />
        <Item label="Worker" value={workerStatus || "—"} />
        <Item
          label="Worker heartbeat"
          value={
            workerHeartbeat
              ? new Date(workerHeartbeat).toLocaleTimeString("no-NO")
              : "—"
          }
        />
      </dl>

      {!job ? (
        <p className="mt-3 text-sm text-slate-600">Ingen aktiv publisering.</p>
      ) : null}

      {(job?.stalled || job?.status === "error") && onResume ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-sm text-amber-800">
            {job.status === "error"
              ? `Stoppet: ${job.stopReason || job.error || "Feil"}`
              : "Publisering ser ut til å ha stoppet."}
          </p>
          <button
            type="button"
            disabled={resumeBusy}
            onClick={onResume}
            className="rounded-xl bg-amber-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            Fortsett
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Item({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-0.5 font-semibold text-slate-900 ${
          mono ? "font-mono text-xs" : "tabular-nums"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
