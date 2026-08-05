/**
 * Store-level AI KPIs for Rob's Desk / Trust dashboard.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { StoreAiKpis } from "@/lib/trust/types";
import { buildEngineScorecards } from "@/lib/trust/scorecard";

export async function buildStoreAiKpis(): Promise<StoreAiKpis> {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const [
    analyzedBuyer,
    analyzedAutonomy,
    imported,
    published,
    margins,
    feedback30,
    feedbackPrev,
    overrides30,
    scorecards,
  ] = await Promise.all([
    prisma.buyerScanRun.aggregate({
      where: { createdAt: { gte: since30 } },
      _sum: { scanned: true },
    }),
    prisma.autonomyRun.findMany({
      where: { startedAt: { gte: since30 } },
      select: { summary: true },
      take: 60,
    }),
    prisma.importQueueItem.count({
      where: {
        createdAt: { gte: since30 },
        status: { notIn: ["failed"] },
      },
    }),
    prisma.importQueueItem.count({
      where: {
        updatedAt: { gte: since30 },
        status: "published",
      },
    }),
    prisma.product.findMany({
      where: { isActive: true, supplierPrice: { gt: 0 }, price: { gt: 0 } },
      select: { price: true, supplierPrice: true },
      take: 500,
    }),
    prisma.aiFeedbackEvent.count({ where: { createdAt: { gte: since30 } } }),
    prisma.aiFeedbackEvent.count({
      where: { createdAt: { gte: since60, lt: since30 } },
    }),
    prisma.aiOverride.count({ where: { createdAt: { gte: since30 } } }),
    buildEngineScorecards(30),
  ]);

  let productsAnalyzed = analyzedBuyer._sum.scanned || 0;
  for (const run of analyzedAutonomy) {
    const s = run.summary as { productsAnalyzed?: number } | null;
    productsAnalyzed += Number(s?.productsAnalyzed || 0);
  }

  const marginVals = margins
    .map((p) => {
      if (!p.supplierPrice || p.supplierPrice <= 0) return null;
      return ((p.price - p.supplierPrice) / p.price) * 100;
    })
    .filter((n): n is number => n != null && Number.isFinite(n));

  const avgMarginPct = marginVals.length
    ? Math.round(
        (marginVals.reduce((a, b) => a + b, 0) / marginVals.length) * 10
      ) / 10
    : null;

  const hitCards = scorecards.filter((c) => c.decisions > 0);
  const hitRate = hitCards.length
    ? Math.round(
        (hitCards.reduce((a, c) => a + c.hitRate, 0) / hitCards.length) * 10
      ) / 10
    : 0;

  // Heuristic only when we have real ops; otherwise null ("Ikke nok data" in UI)
  const timeSavedHoursEst =
    productsAnalyzed + published > 0
      ? Math.round(((productsAnalyzed * 0.75 + published * 4) / 60) * 10) / 10
      : null;

  let improvement30d: number | null = null;
  if (feedbackPrev > 0) {
    improvement30d =
      Math.round(((feedback30 - feedbackPrev) / feedbackPrev) * 1000) / 10;
  } else if (feedback30 > 0) {
    improvement30d = 100;
  }

  // Prefer hit-rate improvement if we have scorecards from self-eval history
  const prevEval = await prisma.aiSelfEvalRun.findFirst({
    orderBy: { createdAt: "desc" },
    skip: 0,
  });
  if (prevEval?.kpis && typeof prevEval.kpis === "object") {
    const prevHit = Number((prevEval.kpis as { hitRate?: number }).hitRate || 0);
    if (prevHit > 0) {
      improvement30d = Math.round((hitRate - prevHit) * 10) / 10;
    }
  }

  return {
    productsAnalyzed,
    productsImported: imported,
    productsPublished: published,
    avgMarginPct,
    hitRate,
    timeSavedHoursEst,
    improvement30d,
    decisions30d: feedback30 + scorecards.reduce((a, c) => a + c.decisions, 0),
    overrides30d: overrides30,
  };
}
