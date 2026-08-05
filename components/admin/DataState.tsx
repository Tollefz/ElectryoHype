"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Clock,
  Database,
  Inbox,
  Loader2,
  RefreshCw,
  ServerCrash,
  WifiOff,
} from "lucide-react";
import type { AdminDataError, AdminSurface } from "@/lib/admin/data-errors";
import { ADMIN_SURFACE_COPY } from "@/lib/admin/data-errors";
import type { LoadStatus } from "@/lib/admin/load-state";
import { isFailureStatus } from "@/lib/admin/load-state";

/** @deprecated Prefer LoadStatus — kept for gradual migration */
export type DataStateKind = "loading" | "empty" | "error" | "offline" | "ready";

type DataStateProps = {
  /** Preferred: explicit LoadStatus */
  status?: LoadStatus;
  /** Legacy alias mapped to status */
  state?: DataStateKind | LoadStatus;
  surface?: AdminSurface;
  title?: string;
  detail?: string;
  error?: AdminDataError | null;
  onRetry?: () => void;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
  /** Banner when showing stale success data */
  staleReason?: string | null;
};

function resolveStatus(
  status?: LoadStatus,
  state?: DataStateKind | LoadStatus
): LoadStatus {
  if (status) return status;
  if (!state) return "loading";
  if (state === "ready") return "success";
  if (state === "error") return "api";
  return state as LoadStatus;
}

function Skeleton({ compact }: { compact?: boolean }) {
  return (
    <div
      className={`animate-pulse space-y-3 ${compact ? "p-3" : "rounded-2xl border border-slate-200 bg-white p-6"}`}
      role="status"
      aria-label="Laster"
    >
      <div className="h-4 w-1/3 rounded bg-slate-200" />
      <div className="h-3 w-2/3 rounded bg-slate-100" />
      <div className="h-3 w-1/2 rounded bg-slate-100" />
      {!compact && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="h-16 rounded-xl bg-slate-100" />
          <div className="h-16 rounded-xl bg-slate-100" />
          <div className="h-16 rounded-xl bg-slate-100" />
        </div>
      )}
      <p className="flex items-center gap-2 pt-2 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Henter data…
      </p>
    </div>
  );
}

function ErrorCard({
  icon,
  title,
  reason,
  onRetry,
  actions,
  className,
  compact,
}: {
  icon: ReactNode;
  title: string;
  reason: string;
  onRetry?: () => void;
  actions?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-amber-200 bg-amber-50/90 ${compact ? "p-4" : "p-6"} ${className || ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-amber-700">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-950">⚠ {title}</p>
          <p className="mt-1 text-sm text-amber-900/90">
            <span className="font-medium">Årsak:</span> {reason}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Prøv igjen
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-950"
            >
              Oppdater
            </button>
            <Link
              href="/admin/suppliers/health"
              className="rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-950"
            >
              Se status
            </Link>
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Shared admin/storefront load UI.
 * Empty is ONLY for successful empty payloads — never for failures.
 */
export function DataState({
  status,
  state,
  surface,
  title,
  detail,
  error,
  onRetry,
  actions,
  children,
  className = "",
  compact,
  staleReason,
}: DataStateProps) {
  const resolved = resolveStatus(status, state);
  const copy = surface ? ADMIN_SURFACE_COPY[surface] : null;

  if (resolved === "loading") {
    return children ? <>{children}</> : <Skeleton compact={compact} />;
  }

  if (resolved === "success") {
    return (
      <>
        {staleReason ? (
          <div
            role="status"
            className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          >
            <span className="font-medium">Data kunne ikke oppdateres.</span>{" "}
            {staleReason} Viser siste kjente resultat.
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="ml-2 font-semibold underline"
              >
                Prøv igjen
              </button>
            ) : null}
          </div>
        ) : null}
        {children}
      </>
    );
  }

  if (isFailureStatus(resolved)) {
    const failKey = resolved as "timeout" | "offline" | "database" | "api";
    const defaults: Record<
      "timeout" | "offline" | "database" | "api",
      { title: string; reason: string; icon: ReactNode }
    > = {
      timeout: {
        title: "Forespørselen tok for lang tid",
        reason: "Tjenesten svarte ikke i tide. Prøv igjen om litt.",
        icon: <Clock className="h-5 w-5" />,
      },
      offline: {
        title: "Nettverksfeil",
        reason: "Ingen kontakt med serveren. Sjekk internettforbindelsen.",
        icon: <WifiOff className="h-5 w-5" />,
      },
      database: {
        title: copy?.errorTitle || "Databasen er utilgjengelig",
        reason:
          error?.reason ||
          "Databasen svarer ikke akkurat nå. Prøv igjen om litt.",
        icon: <Database className="h-5 w-5" />,
      },
      api: {
        title: copy?.errorTitle || "Kan ikke hente data",
        reason: error?.reason || "Noe gikk galt under lasting. Prøv igjen.",
        icon: <ServerCrash className="h-5 w-5" />,
      },
    };
    const d = defaults[failKey];
    return (
      <ErrorCard
        icon={error?.kind === "network" ? <WifiOff className="h-5 w-5" /> : d.icon}
        title={title || error?.title || d.title}
        reason={detail || error?.reason || d.reason}
        onRetry={onRetry}
        actions={actions}
        className={className}
        compact={compact}
      />
    );
  }

  // empty — ONLY after successful empty payload
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-center ${compact ? "px-4 py-8" : "px-6 py-14"} ${className}`}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        <Inbox className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">
        {title || copy?.emptyTitle || "Ingen data"}
      </h3>
      <p className="mt-1.5 max-w-md text-sm text-slate-500">
        {detail || copy?.emptyDetail || "Det er ingenting å vise her ennå."}
      </p>
      {(onRetry || actions) && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"
            >
              Oppdater
            </button>
          ) : null}
          {actions}
        </div>
      )}
      {/* Guard: never look like an error */}
      <p className="sr-only">Tomt resultat etter vellykket forespørsel.</p>
    </div>
  );
}

/** Convenience: render from LoadState union */
export function DataStateFromLoad<T>({
  load,
  surface,
  onRetry,
  children,
  isEmpty,
  compact,
}: {
  load: import("@/lib/admin/load-state").LoadState<T>;
  surface?: AdminSurface;
  onRetry?: () => void;
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  compact?: boolean;
}) {
  if (load.status === "loading") {
    return <DataState status="loading" surface={surface} compact={compact} />;
  }
  if (load.status === "empty") {
    return (
      <DataState status="empty" surface={surface} onRetry={onRetry} compact={compact} />
    );
  }
  if (
    load.status === "timeout" ||
    load.status === "offline" ||
    load.status === "database" ||
    load.status === "api"
  ) {
    return (
      <DataState
        status={load.status}
        surface={surface}
        error={load.error}
        onRetry={onRetry}
        compact={compact}
      />
    );
  }
  // success
  if (isEmpty?.(load.data)) {
    return (
      <DataState status="empty" surface={surface} onRetry={onRetry} compact={compact} />
    );
  }
  return (
    <DataState
      status="success"
      staleReason={load.stale ? load.staleReason : null}
      onRetry={onRetry}
      surface={surface}
      compact={compact}
    >
      {children(load.data)}
    </DataState>
  );
}
