"use client";

import { Loader2, X } from "lucide-react";

export type AiCategorizeProgress = {
  total: number;
  done: number;
  autoApplied: number;
  pending: number;
  needsReview: number;
  errors: number;
  running: boolean;
  finished: boolean;
};

export default function AiCategorizeProgressModal({
  progress,
  onClose,
}: {
  progress: AiCategorizeProgress;
  onClose: () => void;
}) {
  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {progress.finished ? "AI-kategorisering ferdig" : "Analyserer…"}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {progress.finished
                ? "Se oppsummering under. Godkjenningskø åpnes fra produktlisten."
                : "Kjører i batches à 20 produkter."}
            </p>
          </div>
          {(progress.finished || !progress.running) && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-800">
              {progress.done} / {progress.total}
            </span>
            <span className="text-gray-500">{pct} %</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-green-600 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {progress.running && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
            <Loader2 size={16} className="animate-spin" />
            Kategori…
          </div>
        )}

        {(progress.finished || progress.done > 0) && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-green-50 px-3 py-2 text-green-900">
              <div className="text-xs">Auto-satt</div>
              <div className="text-lg font-semibold">{progress.autoApplied}</div>
            </div>
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-blue-900">
              <div className="text-xs">Venter godkjenning</div>
              <div className="text-lg font-semibold">{progress.pending}</div>
            </div>
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              <div className="text-xs">Trenger review</div>
              <div className="text-lg font-semibold">{progress.needsReview}</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-gray-800">
              <div className="text-xs">Feil</div>
              <div className="text-lg font-semibold">{progress.errors}</div>
            </div>
          </div>
        )}

        {progress.finished && (
          <div className="mt-5 flex justify-end gap-2">
            <a
              href="/admin/products/category-audit"
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Åpne godkjenningskø
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Lukk
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
