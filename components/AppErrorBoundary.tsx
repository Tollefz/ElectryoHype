"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { classifyAdminError } from "@/lib/admin/data-errors";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * App-wide client Error Boundary — never shows Prisma / stack to users.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const classified = classifyAdminError(error);
    // String-only log — Error objects in console.error open Next Issues overlay
    console.warn(
      `[app-boundary] ${classified.kind}: ${classified.logMessage || classified.reason}`
    );
    if (info.componentStack) {
      console.warn(`[app-boundary] ${info.componentStack.slice(0, 500)}`);
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg items-center px-4 py-16">
        <div
          role="alert"
          className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm"
        >
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-lg font-semibold text-amber-950">Noe gikk galt</p>
              <p className="mt-1 text-sm text-amber-900/90">Prøv igjen.</p>
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
                  href="/"
                  className="rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-950"
                >
                  Til forsiden
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
