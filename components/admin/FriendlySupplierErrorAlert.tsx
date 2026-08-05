"use client";

import { useState } from "react";
import {
  formatFriendlySupplierError,
  type FriendlySupplierError,
} from "@/lib/buyer/cj-errors";

type Props = {
  raw: string | null | undefined;
  /** Pre-parsed friendly error (optional) */
  friendly?: FriendlySupplierError | null;
  className?: string;
};

/**
 * Admin-facing supplier/CJ error — short title, detail behind toggle.
 */
export function FriendlySupplierErrorAlert({
  raw,
  friendly: pre,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const friendly = pre ?? formatFriendlySupplierError(raw);
  if (!friendly) return null;

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ${className}`}
    >
      <p className="font-semibold">⚠ {friendly.title}</p>
      <p className="mt-1 text-amber-900/90">{friendly.body}</p>
      {friendly.estimatedRestart ? (
        <p className="mt-1 text-xs font-medium tabular-nums">
          Estimert restart: {friendly.estimatedRestart}
        </p>
      ) : null}
      {friendly.detail ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-semibold underline"
          >
            {open ? "Skjul detaljer" : "Vis detaljer"}
          </button>
          {open ? (
            <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-white/80 p-2 text-[11px] text-slate-700">
              {friendly.detail}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
