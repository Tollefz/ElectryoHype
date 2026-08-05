"use client";

import { useEffect, useState } from "react";
import type { BuyerPublishJobSnapshot } from "@/lib/buyer/publish-job-types";

function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return s ? `${m} min ${s} sek` : `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} t ${rm} min` : `${h} t`;
}

function bar(pct: number): string {
  const filled = Math.max(0, Math.min(20, Math.round((pct / 100) * 20)));
  return `${"█".repeat(filled)}${"░".repeat(20 - filled)}`;
}

function useSecondsAgo(iso: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
}

function timeLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("no-NO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

type Props = {
  job: BuyerPublishJobSnapshot;
  workerStatus?: string | null;
  workerHeartbeat?: string | null;
  onDismiss?: () => void;
  onResume?: () => void;
  resumeBusy?: boolean;
  onRetryStart?: () => void;
};

/**
 * Full-page live publish monitor — replaces the candidate list while a job runs.
 * All numbers come from the persisted job (polled), never local invent.
 */
export function BuyerPublishLivePanel({
  job,
  workerStatus,
  workerHeartbeat,
  onDismiss,
  onResume,
  resumeBusy,
  onRetryStart,
}: Props) {
  const [showReport, setShowReport] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const ago = useSecondsAgo(job.updatedAt);
  const done = job.status === "done";
  const stopped = job.status === "error";
  const events = (job.events?.length ? job.events : job.logs || []).slice(-30);
  const remainingDisplay = Math.max(0, job.remaining - (job.inProgress || 0));

  if (done) {
    return (
      <section className="rounded-2xl border border-emerald-300 bg-gradient-to-b from-emerald-50 to-white p-6 shadow-sm">
        <p className="text-lg font-semibold text-emerald-950">
          ✅ Publisering fullført
        </p>
        <p className="mt-1 font-mono text-xs text-slate-500">JobId: {job.id}</p>
        <ul className="mt-5 space-y-1.5 text-sm text-slate-800 sm:text-base">
          <li>
            <span className="font-semibold tabular-nums">
              {job.totalProducts.toLocaleString("no-NO")}
            </span>{" "}
            produkter behandlet
          </li>
          <li>
            <span className="text-emerald-700">✓</span>{" "}
            <span className="font-semibold tabular-nums">
              {job.published.toLocaleString("no-NO")}
            </span>{" "}
            publisert
          </li>
          <li>
            <span className="text-slate-500">↷</span>{" "}
            <span className="font-semibold tabular-nums">
              {job.skipped.toLocaleString("no-NO")}
            </span>{" "}
            hoppet over
          </li>
          <li>
            <span className="text-amber-700">⚠</span>{" "}
            <span className="font-semibold tabular-nums">
              {job.failed.toLocaleString("no-NO")}
            </span>{" "}
            feilet
          </li>
          <li className="pt-1 text-slate-600">
            Tid{" "}
            <span className="font-semibold tabular-nums">
              {fmtDuration(job.elapsedSeconds)}
            </span>
          </li>
        </ul>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowReport((v) => !v)}
            className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
          >
            {showReport ? "Skjul rapport" : "Vis rapport"}
          </button>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Tilbake til kandidater
            </button>
          ) : null}
        </div>

        {showReport ? (
          <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto border-t border-emerald-100 pt-3 text-xs text-slate-600">
            {events.map((line, i) => (
              <li key={`${line.at}-${i}`}>
                <span className="tabular-nums text-slate-400">
                  {timeLabel(line.at)}
                </span>{" "}
                {line.message}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-emerald-300 bg-gradient-to-b from-emerald-50 to-white p-6 shadow-sm">
      <p className="text-lg font-semibold tracking-tight text-emerald-950">
        Publiserer produkter
      </p>
      <p className="mt-1 font-mono text-xs text-slate-500">
        JobId: {job.id}
        {job.requestId ? ` · ${job.requestId}` : ""}
      </p>

      {stopped ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-950">
            ⚠ Publiseringen stoppet.
          </p>
          <p className="mt-1 text-sm text-amber-900">
            Årsak: {job.stopReason || job.error || "Ukjent feil"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onResume ? (
              <button
                type="button"
                disabled={resumeBusy}
                onClick={onResume}
                className="rounded-xl bg-amber-800 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {resumeBusy ? "Fortsetter…" : "Fortsett"}
              </button>
            ) : null}
            {onRetryStart ? (
              <button
                type="button"
                onClick={onRetryStart}
                className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950"
              >
                Prøv igjen
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900"
            >
              {showDetails ? "Skjul detaljer" : "Vis detaljer"}
            </button>
          </div>
          {showDetails && (job.stopDetail || job.error) ? (
            <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-white/80 p-2 text-[11px] text-slate-700">
              {job.stopDetail || job.error}
            </pre>
          ) : null}
        </div>
      ) : null}

      {job.stalled && !stopped && onResume ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-950">
            Publisering ser ut til å ha stoppet.
          </p>
          <p className="mt-1 text-xs text-amber-900/80">
            Ingen worker-fremdrift på {Math.round(job.heartbeatAgeMs / 1000)}{" "}
            sek. Workeren gjenopptar vanligvis selv — bruk Fortsett som
            nødknapp.
          </p>
          <button
            type="button"
            disabled={resumeBusy}
            onClick={onResume}
            className="mt-3 rounded-xl bg-amber-800 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {resumeBusy ? "Fortsetter…" : "Fortsett"}
          </button>
        </div>
      ) : null}

      {!stopped ? (
        <>
          <p className="mt-5 font-mono text-base tabular-nums tracking-tight text-slate-800 sm:text-lg">
            {bar(job.pct)}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {job.processed.toLocaleString("no-NO")} /{" "}
            {job.totalProducts.toLocaleString("no-NO")}
          </p>
        </>
      ) : null}

      {(job.lastPublishedProductName || job.nextBatchProductName) &&
      !stopped ? (
        <div className="mt-4 space-y-1.5 rounded-xl border border-emerald-100 bg-white/70 px-4 py-3 text-sm text-slate-800">
          {job.lastPublishedProductName ? (
            <p>
              <span className="text-slate-500">Sist publisert</span>
              <br />
              <span className="font-medium">{job.lastPublishedProductName}</span>
            </p>
          ) : null}
          {job.nextBatchProductName ? (
            <p>
              <span className="text-slate-500">Neste batch</span>
              <br />
              <span className="font-medium">{job.nextBatchProductName}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="✓ Publisert" value={job.published} />
        <Stat label="⟳ Pågår" value={job.inProgress || 0} />
        <Stat label="⚠ Feilet" value={job.failed} />
        <Stat label="↷ Hoppet over" value={job.skipped} />
        <Stat
          label="Produkter/min"
          valueLabel={
            job.productsPerMin != null ? String(job.productsPerMin) : "—"
          }
        />
        <Stat
          label="Batch"
          valueLabel={`${job.currentBatch} / ${job.totalBatches}`}
        />
        <Stat label="ETA" valueLabel={fmtDuration(job.etaSeconds)} />
        <Stat
          label="Gjenstår"
          value={remainingDisplay}
        />
      </dl>

      <p className="mt-4 text-sm text-slate-500">
        Oppdatert{" "}
        {ago < 1 ? "nå" : `for ${ago} sek siden`}
        {job.busy ? " · batch kjører…" : ""}
        {workerStatus ? ` · Worker: ${workerStatus}` : ""}
        {workerHeartbeat
          ? ` · heartbeat ${new Date(workerHeartbeat).toLocaleTimeString("no-NO")}`
          : ""}
      </p>

      {events.length > 0 ? (
        <div className="mt-5 border-t border-emerald-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Hendelseslogg
          </p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-slate-700">
            {[...events].reverse().map((line, i) => (
              <li key={`${line.at}-${i}`} className="flex gap-3">
                <span className="w-12 shrink-0 tabular-nums text-slate-400">
                  {timeLabel(line.at)}
                </span>
                <span
                  className={
                    line.level === "err"
                      ? "text-rose-700"
                      : line.level === "warn"
                        ? "text-amber-800"
                        : ""
                  }
                >
                  {line.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  valueLabel,
}: {
  label: string;
  value?: number;
  valueLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white/80 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-lg font-semibold tabular-nums text-slate-900">
        {valueLabel ??
          (value != null ? value.toLocaleString("no-NO") : "—")}
      </dd>
    </div>
  );
}
