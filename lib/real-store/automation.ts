/**
 * Automation Score — how much of each domain AI handles.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { buildEngineScorecards } from "@/lib/trust/scorecard";
import { buildStoreAiKpis } from "@/lib/trust/kpis";
import type { AutomationScore } from "@/lib/real-store/types";

function clampPct(n: number): number {
  return Math.max(0, Math.min(99, Math.round(n)));
}

export async function buildAutomationScore(): Promise<AutomationScore> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [scorecards, kpis, feedback, overrides, improveApplied, improvePending, jobsOk, jobsTotal, autonomy] =
    await Promise.all([
      buildEngineScorecards(30),
      buildStoreAiKpis(),
      prisma.aiFeedbackEvent.count({ where: { createdAt: { gte: since } } }),
      prisma.aiOverride.count({ where: { createdAt: { gte: since } } }),
      prisma.storeImprovement.count({
        where: { status: "applied", appliedAt: { gte: since } },
      }),
      prisma.storeImprovement.count({ where: { status: "pending" } }),
      prisma.supplierJob.count({
        where: { createdAt: { gte: since }, status: "succeeded" },
      }),
      prisma.supplierJob.count({ where: { createdAt: { gte: since } } }),
      prisma.autonomyPolicy.findFirst({ select: { mode: true } }),
    ]);

  const byEngine = Object.fromEntries(
    scorecards.map((c) => [c.engine, c])
  ) as Record<string, (typeof scorecards)[0]>;

  const modeBoost =
    autonomy?.mode === "auto" ? 8 : autonomy?.mode === "semi" ? 4 : 0;

  const procurement = clampPct(
    55 +
      modeBoost +
      Math.min(25, (byEngine.digital_buyer?.hitRate || 0) * 0.25) +
      Math.min(15, (byEngine.merchandiser?.approvalRate || 0) * 0.15)
  );

  const seo = clampPct(
    60 +
      Math.min(30, improveApplied * 2) +
      Math.min(10, (byEngine.seo?.hitRate || 40) * 0.1)
  );

  const categorization = clampPct(
    58 +
      Math.min(30, (byEngine.store_intelligence?.approvalRate || 0) * 0.3) +
      modeBoost
  );

  const pricing = clampPct(
    62 + Math.min(25, (byEngine.pricing?.hitRate || 50) * 0.2) + modeBoost
  );

  const productImprovement = clampPct(
    50 +
      Math.min(35, improveApplied * 3) +
      Math.max(0, 10 - improvePending)
  );

  const supplierMonitoring = clampPct(
    jobsTotal > 0 ? 70 + (jobsOk / jobsTotal) * 29 : 85
  );

  const areas = [
    { id: "procurement" as const, label: "Produktinnkjøp", pct: procurement },
    { id: "seo" as const, label: "SEO", pct: seo },
    { id: "categorization" as const, label: "Kategorisering", pct: categorization },
    { id: "pricing" as const, label: "Prissetting", pct: pricing },
    {
      id: "product_improvement" as const,
      label: "Produktforbedring",
      pct: productImprovement,
    },
    {
      id: "supplier_monitoring" as const,
      label: "Leverandørovervåking",
      pct: supplierMonitoring,
    },
  ];

  const overallPct = clampPct(
    areas.reduce((a, x) => a + x.pct, 0) / areas.length
  );

  // Heuristic admin minutes: base 45, reduce with automation & approvals done
  const adminMinutesPerDayEst = Math.max(
    12,
    Math.round(
      45 -
        overallPct * 0.25 -
        Math.min(10, improveApplied) +
        Math.min(15, improvePending * 1.5) +
        Math.min(8, overrides)
    )
  );

  void feedback;
  void kpis;

  return { areas, adminMinutesPerDayEst, overallPct };
}
