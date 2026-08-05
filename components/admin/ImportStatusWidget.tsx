"use client";

import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { useImportJobOptional } from "@/components/admin/ImportJobProvider";
import { importJobProgressPct } from "@/lib/ops/import-job";

function Bar({ pct }: { pct: number }) {
  const blocks = 10;
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * blocks);
  return (
    <div className="font-mono text-xs tracking-tight text-emerald-800" aria-hidden>
      {"█".repeat(filled)}
      {"░".repeat(blocks - filled)}
    </div>
  );
}

function formatEta(sec: number | null): string {
  if (sec == null) return "Ikke nok data";
  if (sec <= 0) return "—";
  if (sec < 60) return `${sec}s`;
  return `${Math.ceil(sec / 60)} min`;
}

export function ImportStatusWidget() {
  const ctx = useImportJobOptional();
  if (!ctx?.job || ctx.job.phase === "idle") return null;

  const { job, dismissJob, setMinimized } = ctx;
  const pct = importJobProgressPct(job);
  const inProgress =
    job.phase === "queuing" || job.phase === "processing";
  const allFailed =
    job.phase === "done" && job.succeeded === 0 && job.failed > 0;
  const allOk = job.phase === "done" && job.succeeded > 0 && job.failed === 0;
  const partial =
    job.phase === "done" && job.succeeded > 0 && job.failed > 0;

  if (job.minimized && inProgress) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-[70] flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-lg"
      >
        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
        Import {pct}%
      </button>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[70] w-[min(100vw-2rem,22rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Supplier Engine
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">
            {job.phase === "queuing"
              ? "Sender til import…"
              : job.phase === "processing"
                ? "Importerer produkter…"
                : job.phase === "error"
                  ? "Import feilet"
                  : allFailed
                    ? "Import fullført med feil"
                    : "✔ Import ferdig"}
          </p>
        </div>
        <div className="flex gap-1">
          {inProgress && (
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
              title="Minimer"
            >
              —
            </button>
          )}
          {(job.phase === "done" || job.phase === "error") && (
            <button
              type="button"
              onClick={dismissJob}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
              aria-label="Lukk"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {inProgress && (
        <>
          <p className="mt-3 text-sm tabular-nums text-slate-700">
            <span className="font-semibold">
              {(job.succeeded + job.failed).toLocaleString("no-NO")}
            </span>
            {" / "}
            {job.totalTarget.toLocaleString("no-NO")}
          </p>
          <div className="mt-2">
            <Bar pct={pct} />
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
            <li>
              Kø:{" "}
              <span className="font-semibold tabular-nums text-slate-900">
                {job.queued.toLocaleString("no-NO")}
              </span>
            </li>
            <li>
              Behandles:{" "}
              <span className="font-semibold tabular-nums text-slate-900">
                {job.processing.toLocaleString("no-NO")}
              </span>
            </li>
            <li>
              Feilet:{" "}
              <span className="font-semibold tabular-nums text-slate-900">
                {job.failed.toLocaleString("no-NO")}
              </span>
            </li>
            <li>
              ETA:{" "}
              <span className="font-semibold tabular-nums text-slate-900">
                {formatEta(job.etaSeconds)}
              </span>
            </li>
          </ul>
        </>
      )}

      {allOk && (
        <p className="mt-3 text-sm text-emerald-800">
          ✔ {job.readyForReview.toLocaleString("no-NO")} klare
          {job.readyForReview > 0 ? " · trenger review" : ""}
        </p>
      )}

      {partial && (
        <div className="mt-3 space-y-1 text-sm">
          <p className="text-emerald-800">
            ✔ {job.succeeded.toLocaleString("no-NO")} klare
          </p>
          <p className="text-amber-800">
            ⚠ {job.failed.toLocaleString("no-NO")} feilet
            {job.readyForReview > 0
              ? ` · ${job.readyForReview.toLocaleString("no-NO")} trenger review`
              : ""}
          </p>
        </div>
      )}

      {allFailed && (
        <div className="mt-3 text-sm text-red-800">
          <p>Ingen produkter ble importert.</p>
          {job.failureReasons[0] && (
            <p className="mt-1 text-xs text-red-700">
              Årsak: {job.failureReasons[0].count}× {job.failureReasons[0].label}
              {job.failureReasons.length > 1
                ? ` (+${job.failureReasons.length - 1} flere)`
                : ""}
            </p>
          )}
        </div>
      )}

      {job.phase === "error" && (
        <p className="mt-3 text-sm text-red-700">{job.error || "Feil"}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {inProgress && (
          <Link
            href="/admin/suppliers/import-queue"
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
          >
            Åpne detaljer
          </Link>
        )}
        {(allOk || partial) && job.readyForReview > 0 && (
          <Link
            href="/admin/suppliers/import-queue?status=review"
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
            onClick={dismissJob}
          >
            Gå til Review
          </Link>
        )}
        {(allFailed || job.phase === "error") && (
          <Link
            href="/admin/suppliers/import-queue?status=failed"
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-red-700 px-3 py-2 text-xs font-semibold text-white"
            onClick={dismissJob}
          >
            Åpne feillogg
          </Link>
        )}
        {(job.phase === "done" || job.phase === "error") && (
          <Link
            href="/admin/suppliers/import-queue"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
          >
            Se detaljer
          </Link>
        )}
      </div>
    </div>
  );
}
