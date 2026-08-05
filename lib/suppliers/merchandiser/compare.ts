/**
 * Compare candidates — pick a winner with explainability.
 */

import type { MerchandiserScoreBreakdown } from "@/lib/suppliers/merchandiser/types";

export type CompareCandidate = {
  id: string;
  title: string;
  overallScore: number;
  scores: MerchandiserScoreBreakdown;
  reasons: string[];
  imageUrl?: string | null;
};

export type CompareResult = {
  winnerId: string;
  winnerTitle: string;
  why: string[];
  ranking: Array<{ id: string; title: string; overallScore: number; delta: number }>;
};

export function compareMerchandiserCandidates(
  candidates: CompareCandidate[]
): CompareResult {
  if (candidates.length === 0) {
    throw new Error("Ingen kandidater å sammenligne");
  }

  const sorted = [...candidates].sort((a, b) => b.overallScore - a.overallScore);
  const winner = sorted[0];
  const runner = sorted[1];

  const why: string[] = [`Høyest samlet score (${winner.overallScore}/100).`];
  if (winner.reasons?.[0]) why.push(winner.reasons[0]);
  if (winner.reasons?.[1]) why.push(winner.reasons[1]);

  if (runner) {
    const dims: Array<keyof MerchandiserScoreBreakdown> = [
      "marginPotential",
      "visualQuality",
      "categoryFit",
      "imageQuality",
      "shippingQuality",
    ];
    for (const d of dims) {
      const delta = (winner.scores?.[d] || 0) - (runner.scores?.[d] || 0);
      if (delta >= 8) {
        why.push(`Bedre ${d} (+${Math.round(delta)} vs «${runner.title.slice(0, 40)}»).`);
      }
      if (why.length >= 5) break;
    }
  }

  return {
    winnerId: winner.id,
    winnerTitle: winner.title,
    why: why.slice(0, 6),
    ranking: sorted.map((c) => ({
      id: c.id,
      title: c.title,
      overallScore: c.overallScore,
      delta: Math.round((c.overallScore - winner.overallScore) * 10) / 10,
    })),
  };
}
