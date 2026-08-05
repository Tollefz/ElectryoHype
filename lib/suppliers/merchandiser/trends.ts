/**
 * Future trend signal architecture — not wired to live data yet.
 * Google Trends / sales history / season hooks land here later.
 */

import type { TrendSignalProvider } from "@/lib/suppliers/merchandiser/types";

/**
 * Placeholder providers — implement later without touching Merchandiser core.
 */
export const TREND_SIGNAL_PROVIDERS: TrendSignalProvider[] = [
  {
    id: "google_trends",
    displayName: "Google Trends",
    async isConfigured() {
      return false;
    },
    async getSignals() {
      return [];
    },
  },
  {
    id: "own_sales",
    displayName: "Egen salgshistorikk",
    async isConfigured() {
      return false;
    },
    async getSignals() {
      return [];
    },
  },
  {
    id: "seasonality",
    displayName: "Sesongmodell",
    async isConfigured() {
      return false;
    },
    async getSignals() {
      return [];
    },
  },
];

/** Reserved: blend trend boost into overall score when providers are live. */
export async function getTrendBoost(_input: {
  keywords: string[];
  category?: string | null;
}): Promise<number> {
  // Architecture only — always 0 until trendSignalsEnabled + providers configured.
  return 0;
}
