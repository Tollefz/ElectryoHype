"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { classifyAdminError } from "@/lib/admin/data-errors";

/** Fallback for /admin/* outside the panel segment (e.g. login layout issues). */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const classified = classifyAdminError(error);
    console.error("[admin/error.tsx]", classified.logMessage, error.digest);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div
        role="alert"
        className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm"
      >
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold text-amber-950">Noe gikk galt</p>
            <p className="mt-1 text-sm text-amber-900/90">
              Administrasjonen kan fortsatt brukes. Prøv igjen.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white"
              >
                Prøv igjen
              </button>
              <Link
                href="/admin/dashboard"
                className="rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-950"
              >
                Rob&apos;s Desk
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
