"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { classifyAdminError } from "@/lib/admin/data-errors";

type Props = {
  children: ReactNode;
  /** Optional label for logs */
  name?: string;
};

type State = { error: Error | null };

/**
 * Top-level admin client Error Boundary.
 * Never shows Prisma / stack — only human recovery UI.
 */
export class AdminErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const classified = classifyAdminError(error);
    // Client-side structured log (server ring is separate)
    console.error(
      "[admin-boundary]",
      JSON.stringify({
        name: this.props.name || "admin",
        kind: classified.kind,
        message: classified.logMessage,
        componentStack: info.componentStack?.slice(0, 2000),
        timestamp: new Date().toISOString(),
      })
    );
    // Best-effort report to API (never throws to UI)
    try {
      void fetch("/api/admin/system-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "client_error",
          message: classified.logMessage,
          kind: classified.kind,
          stack: error.stack?.slice(0, 4000),
          componentStack: info.componentStack?.slice(0, 2000),
          route:
            typeof window !== "undefined" ? window.location.pathname : undefined,
          browser:
            typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        }),
      }).catch(() => {});
    } catch {
      /* never throw from boundary */
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50/95 p-6 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-lg font-semibold text-amber-950">
                Noe gikk galt
              </p>
              <p className="mt-1 text-sm text-amber-900/90">
                Administrasjonen kan fortsatt brukes. Prøv igjen — eller gå tilbake
                til Rob&apos;s Desk.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => this.setState({ error: null })}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Prøv igjen
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-950"
                >
                  Oppdater siden
                </button>
                <Link
                  href="/admin/dashboard"
                  className="rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-950"
                >
                  Rob&apos;s Desk
                </Link>
                <Link
                  href="/admin/suppliers/health"
                  className="rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-950"
                >
                  Se status
                </Link>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
