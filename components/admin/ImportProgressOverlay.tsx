"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  IMPORT_JOURNEY_LABELS,
  IMPORT_JOURNEY_STAGES,
  type FailureReasonGroup,
  type ImportJourneyStage,
} from "@/lib/ops/import-failure-reasons";

export type ImportProgressState = {
  phase: "waiting" | "queuing" | "processing" | "done" | "error";
  sent: number;
  totalTarget: number;
  done: number;
  processing: number;
  queued: number;
  importing: number;
  aiAnalyzing: number;
  review: number;
  approved: number;
  published: number;
  failed: number;
  readyForReview: number;
  succeeded: number;
  etaSeconds: number | null;
  journeyStage: ImportJourneyStage;
  failureReasons: FailureReasonGroup[];
  error?: string | null;
  queueItemIds: string[];
};

function formatEta(sec: number | null): string {
  if (sec == null) return "Ikke nok data";
  if (sec <= 0) return "—";
  if (sec < 60) return `ca. ${sec}s`;
  return `ca. ${Math.ceil(sec / 60)} min`;
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const blocks = 12;
  const filled = Math.round((clamped / 100) * blocks);
  return (
    <div
      className="font-mono text-sm tracking-tight text-emerald-800"
      aria-hidden
    >
      {"█".repeat(filled)}
      {"░".repeat(blocks - filled)}
    </div>
  );
}

function Journey({ current }: { current: ImportJourneyStage }) {
  const idx = IMPORT_JOURNEY_STAGES.indexOf(current);
  return (
    <ol className="mt-4 space-y-1.5">
      {IMPORT_JOURNEY_STAGES.map((stage, i) => {
        const active = i === idx;
        const past = i < idx;
        return (
          <li
            key={stage}
            className={`flex items-center gap-2 text-sm ${
              active
                ? "font-semibold text-slate-900"
                : past
                  ? "text-emerald-700"
                  : "text-slate-400"
            }`}
          >
            <span className="w-4 text-center" aria-hidden>
              {past ? "✓" : active ? "●" : "○"}
            </span>
            <span>{IMPORT_JOURNEY_LABELS[stage]}</span>
            {active && stage !== "done" ? (
              <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function FailureReasons({ reasons }: { reasons: FailureReasonGroup[] }) {
  if (!reasons.length) {
    return (
      <p className="mt-2 text-sm text-slate-600">
        Årsak: Ikke nok data (ingen feilmelding lagret).
      </p>
    );
  }
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Årsak
      </p>
      <ul className="mt-1.5 space-y-1 text-sm text-slate-800">
        {reasons.map((r) => (
          <li key={r.key}>
            • {r.count.toLocaleString("no-NO")} {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function titleFor(state: ImportProgressState): string {
  if (state.phase === "error") return "Import feilet";
  if (state.phase === "waiting") return "Venter…";
  if (state.phase === "queuing") return "Sender til import…";
  if (state.phase === "processing") return "Import pågår…";
  if (state.phase === "done") {
    if (state.succeeded === 0 && state.failed > 0) {
      return "Import fullført med feil";
    }
    if (state.failed > 0) return "Import fullført (delvis)";
    return "Import ferdig";
  }
  return "Import pågår…";
}

export function ImportProgressOverlay({
  open,
  state,
  onClose,
}: {
  open: boolean;
  state: ImportProgressState | null;
  onClose: () => void;
}) {
  if (!open || !state) return null;

  const total = Math.max(state.totalTarget, state.sent, 1);
  const terminal = state.succeeded + state.failed;
  const processed =
    state.phase === "queuing"
      ? state.sent
      : Math.min(total, Math.max(terminal, total - state.queued - state.processing));
  const pct =
    state.phase === "done"
      ? 100
      : Math.min(99, Math.round((processed / total) * 100));

  const allFailed =
    state.phase === "done" && state.succeeded === 0 && state.failed > 0;
  const partialFail =
    state.phase === "done" && state.succeeded > 0 && state.failed > 0;
  const allOk = state.phase === "done" && state.succeeded > 0 && state.failed === 0;
  const inProgress =
    state.phase === "waiting" ||
    state.phase === "queuing" ||
    state.phase === "processing";

  const failLogHref =
    state.queueItemIds.length > 0
      ? `/admin/suppliers/import-queue?status=failed`
      : "/admin/suppliers/import-queue?status=failed";
  const reviewHref = "/admin/suppliers/import-queue?status=review";
  const detailsHref =
    state.queueItemIds.length > 0
      ? `/admin/suppliers/import-queue`
      : "/admin/suppliers/import-queue";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-progress-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h2
          id="import-progress-title"
          className="text-lg font-semibold text-slate-900"
        >
          {titleFor(state)}
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          {state.sent.toLocaleString("no-NO")} produkter sendt til import
          {state.totalTarget > state.sent
            ? ` av ${state.totalTarget.toLocaleString("no-NO")}`
            : ""}
        </p>

        {state.phase !== "error" && (
          <div className="mt-4 space-y-2">
            <ProgressBar pct={pct} />
            <p className="text-xs text-slate-500">
              {inProgress
                ? `${pct} % · ETA ${formatEta(state.etaSeconds)}`
                : allFailed
                  ? "Ingen produkter ble importert"
                  : "100 %"}
            </p>
          </div>
        )}

        <Journey current={state.journeyStage} />

        {inProgress ? (
          <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
            <li>
              <span className="font-semibold tabular-nums">
                {terminal.toLocaleString("no-NO")}
              </span>{" "}
              ferdig
            </li>
            <li>
              <span className="font-semibold tabular-nums">
                {state.processing.toLocaleString("no-NO")}
              </span>{" "}
              under behandling
              {state.aiAnalyzing > 0
                ? ` (AI: ${state.aiAnalyzing.toLocaleString("no-NO")})`
                : ""}
            </li>
            <li>
              <span className="font-semibold tabular-nums">
                {state.queued.toLocaleString("no-NO")}
              </span>{" "}
              i kø
            </li>
          </ul>
        ) : null}

        {allOk ? (
          <p className="mt-4 text-sm font-medium text-emerald-800">
            ✔ {state.readyForReview.toLocaleString("no-NO")} klare for review
            {state.published > 0
              ? ` · ${state.published.toLocaleString("no-NO")} publisert`
              : ""}
          </p>
        ) : null}

        {partialFail ? (
          <div className="mt-4 space-y-1 text-sm">
            <p className="font-medium text-emerald-800">
              ✔ {state.succeeded.toLocaleString("no-NO")} klare
              {state.readyForReview > 0
                ? ` (${state.readyForReview.toLocaleString("no-NO")} til review)`
                : ""}
            </p>
            <p className="font-medium text-amber-800">
              ⚠ {state.failed.toLocaleString("no-NO")} feilet
            </p>
            <FailureReasons reasons={state.failureReasons} />
          </div>
        ) : null}

        {allFailed ? (
          <div className="mt-4">
            <p className="text-sm font-medium text-red-800">
              Ingen produkter ble importert.
            </p>
            <p className="mt-2 text-sm font-medium text-red-700">
              {state.failed.toLocaleString("no-NO")} feilet
            </p>
            <FailureReasons reasons={state.failureReasons} />
          </div>
        ) : null}

        {state.phase === "error" && (
          <p className="mt-4 text-sm text-red-700">
            {state.error || "Noe gikk galt under import."}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {allOk || partialFail ? (
            <Link
              href={reviewHref}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
              onClick={onClose}
            >
              Gå til Review
            </Link>
          ) : null}

          {partialFail ? (
            <Link
              href={failLogHref}
              className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900"
              onClick={onClose}
            >
              Se feil
            </Link>
          ) : null}

          {allFailed || state.phase === "error" ? (
            <Link
              href={failLogHref}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
              onClick={onClose}
            >
              Åpne feillogg
            </Link>
          ) : null}

          {(state.phase === "done" || state.phase === "error" || inProgress) && (
            <Link
              href={detailsHref}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={inProgress ? undefined : onClose}
            >
              Se detaljer
            </Link>
          )}

          {(state.phase === "done" || state.phase === "error") && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Lukk
            </button>
          )}

          {inProgress && (
            <span className="inline-flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Jobber — lukk ikke før ferdig
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function emptyImportProgress(
  totalTarget: number
): ImportProgressState {
  return {
    phase: "waiting",
    sent: 0,
    totalTarget,
    done: 0,
    processing: 0,
    queued: 0,
    importing: 0,
    aiAnalyzing: 0,
    review: 0,
    approved: 0,
    published: 0,
    failed: 0,
    readyForReview: 0,
    succeeded: 0,
    etaSeconds: null,
    journeyStage: "waiting",
    failureReasons: [],
    queueItemIds: [],
  };
}
