/**
 * Future intelligence signal providers — architecture only.
 * Google Trends, GA, Search Console, ads, returns, conversion — later.
 */

import type { IntelligenceSignalProvider } from "@/lib/intelligence/types";

export const INTELLIGENCE_SIGNAL_PROVIDERS: IntelligenceSignalProvider[] = [
  {
    id: "google_trends",
    displayName: "Google Trends",
    status: "planned",
    async isConfigured() {
      return false;
    },
  },
  {
    id: "seasonality",
    displayName: "Sesongmodell",
    status: "planned",
    async isConfigured() {
      return false;
    },
  },
  {
    id: "sales_history",
    displayName: "Salgstall",
    status: "stub",
    async isConfigured() {
      return false;
    },
  },
  {
    id: "google_analytics",
    displayName: "Google Analytics",
    status: "planned",
    async isConfigured() {
      return false;
    },
  },
  {
    id: "search_console",
    displayName: "Search Console",
    status: "planned",
    async isConfigured() {
      return false;
    },
  },
  {
    id: "meta_ads",
    displayName: "Meta Ads",
    status: "planned",
    async isConfigured() {
      return false;
    },
  },
  {
    id: "google_ads",
    displayName: "Google Ads",
    status: "planned",
    async isConfigured() {
      return false;
    },
  },
  {
    id: "returns",
    displayName: "Returer",
    status: "planned",
    async isConfigured() {
      return false;
    },
  },
  {
    id: "conversion",
    displayName: "Konvertering",
    status: "planned",
    async isConfigured() {
      return false;
    },
  },
];

/** Reserved blend hook — always 0 until providers are active. */
export async function getExternalIntelligenceBoost(_input: {
  category?: string;
}): Promise<number> {
  return 0;
}
