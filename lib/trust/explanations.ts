/**
 * Normalize engine-specific payloads into a trust explanation contract.
 */

import type { TrustExplanation } from "@/lib/trust/types";

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(String).filter(Boolean);
}

export function buildTrustExplanation(input: {
  why?: unknown;
  reasons?: unknown;
  shopMatchWhy?: unknown;
  explanation?: string | null;
  risks?: unknown;
  against?: unknown;
  confidence?: number | null;
  dataUsed?: string[];
  alternatives?: string[];
  filterReasons?: unknown;
}): TrustExplanation {
  const why = [
    ...asStringArray(input.why),
    ...asStringArray(input.reasons),
    ...asStringArray(input.shopMatchWhy),
  ];
  if (input.explanation) why.push(input.explanation);

  const against = [
    ...asStringArray(input.against),
    ...asStringArray(input.filterReasons),
  ];

  const risks = asStringArray(input.risks);

  return {
    why: [...new Set(why)].slice(0, 10),
    dataUsed: input.dataUsed || [
      "Butikkprofil",
      "Merchandiser-score",
      "Store Memory",
      "Leverandørdata",
    ],
    against: [...new Set(against)].slice(0, 8),
    confidence:
      input.confidence == null || Number.isNaN(input.confidence)
        ? null
        : Math.max(0, Math.min(100, Math.round(input.confidence))),
    risks: [...new Set(risks)].slice(0, 8),
    alternatives: (input.alternatives || []).slice(0, 6),
  };
}
