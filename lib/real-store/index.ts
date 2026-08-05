/**
 * Real Store Mode snapshot for Rob's Desk.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { buildAutomationScore } from "@/lib/real-store/automation";
import { runCatalogQualityChecks } from "@/lib/real-store/catalog-qa";
import { getPerformanceProblems } from "@/lib/real-store/performance";
import { buildStoreAiKpis } from "@/lib/trust/kpis";
import type { MaturityGate, RealStoreSnapshot } from "@/lib/real-store/types";

export async function buildRealStoreSnapshot(
  storeId?: string | null
): Promise<RealStoreSnapshot> {
  const [
    automation,
    catalogIssues,
    performanceProblems,
    kpis,
    productCount,
    activeCount,
    buyerScanned,
    latestImprove,
    pendingImprove,
    pendingOrders,
  ] = await Promise.all([
    buildAutomationScore(),
    runCatalogQualityChecks(storeId),
    getPerformanceProblems(),
    buildStoreAiKpis(),
    prisma.product.count(storeId ? { where: { storeId } } : undefined),
    prisma.product.count({
      where: { isActive: true, ...(storeId ? { storeId } : {}) },
    }),
    prisma.buyerScanRun.aggregate({
      _sum: { scanned: true },
    }),
    prisma.storeImproveRun.findFirst({
      orderBy: { createdAt: "desc" },
      select: { stats: true, summaryText: true, finishedAt: true },
    }),
    prisma.storeImprovement.count({ where: { status: "pending" } }),
    prisma.order.count({
      where: {
        paymentStatus: "paid",
        fulfillmentStatus: "NEW",
        archivedAt: null,
        ...(storeId ? { storeId } : {}),
      },
    }),
  ]);

  const avgQ = await prisma.product.aggregate({
    where: {
      qualityScore: { not: null },
      ...(storeId ? { storeId } : {}),
    },
    _avg: { qualityScore: true },
  });

  const scannedTotal =
    (buyerScanned._sum.scanned || 0) + kpis.productsAnalyzed;

  const gates: MaturityGate[] = [
    {
      id: "scan_10k",
      label: "AI har analysert ≥ 10 000 produkter",
      met: scannedTotal >= 10_000,
      detail: `${scannedTotal.toLocaleString("no-NO")} analysert`,
    },
    {
      id: "catalog_size",
      label: "Ekte katalog (≥ 25 aktive produkter)",
      met: activeCount >= 25,
      detail: `${activeCount} aktive / ${productCount} totalt`,
    },
    {
      id: "catalog_qa",
      label: "Ingen høy-alvorlige katalogfeil",
      met: !catalogIssues.some((i) => i.severity === "high"),
      detail: `${catalogIssues.filter((i) => i.severity === "high").length} høy`,
    },
    {
      id: "automation",
      label: "Automation Score ≥ 85 %",
      met: automation.overallPct >= 85,
      detail: `${automation.overallPct} %`,
    },
    {
      id: "admin_time",
      label: "Admin ≤ 20 min/dag (estimat)",
      met: automation.adminMinutesPerDayEst <= 20,
      detail: `${automation.adminMinutesPerDayEst} min`,
    },
    {
      id: "ops_clear",
      label: "Ingen kritiske ytelsesproblemer",
      met: performanceProblems.length === 0,
      detail:
        performanceProblems.length === 0
          ? "OK"
          : `${performanceProblems.length} problem(er)`,
    },
  ];

  const metCount = gates.filter((g) => g.met).length;
  const maturityScore = Math.round((metCount / gates.length) * 100);
  const maturityLabel =
    maturityScore >= 85
      ? "Moden — Real Store"
      : maturityScore >= 50
        ? "Under opptrapping"
        : "Tidlig katalogbygging";

  const stats = (latestImprove?.stats || {}) as {
    aiReview?: string;
    weekImproved?: number;
  };

  const readyFor20MinDay =
    gates.find((g) => g.id === "admin_time")?.met === true &&
    gates.find((g) => g.id === "catalog_size")?.met === true &&
    pendingOrders < 5 &&
    pendingImprove < 20;

  return {
    maturityScore,
    maturityLabel,
    gates,
    automation,
    catalogQualityAvg:
      avgQ._avg.qualityScore != null
        ? Math.round(avgQ._avg.qualityScore * 10) / 10
        : null,
    catalogIssues,
    performanceProblems,
    dailyImprovements: pendingImprove,
    workSavedHours30d: kpis.timeSavedHoursEst ?? 0,
    aiReview: stats.aiReview || null,
    readyFor20MinDay,
  };
}
