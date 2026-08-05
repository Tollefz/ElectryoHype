"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  name: string;
  children: ReactNode;
  /** Compact fallback when a widget dies. */
  fallbackHint?: string;
};

type State = { error: Error | null };

/**
 * Isolates Rob's Desk widgets — one failure must not take down the page.
 */
export class DeskWidgetBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Rob's Desk] widget "${this.props.name}" crashed`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950"
        >
          <p className="font-semibold">
            {this.props.name} kunne ikke vises akkurat nå
          </p>
          <p className="mt-1 text-amber-900/80">
            {this.props.fallbackHint ||
              "Resten av skrivebordet fungerer. Prøv å laste siden på nytt om et øyeblikk."}
          </p>
          <button
            type="button"
            className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950"
            onClick={() => this.setState({ error: null })}
          >
            Prøv igjen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
