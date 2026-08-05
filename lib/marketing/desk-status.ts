/**
 * Rob's Desk — Marketing Mission Control snapshot (observation only).
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getMarketingDashboard } from "./marketing-dashboard";
import { getMarketingInsights } from "./marketing-insights";
import { getMarketingRecommendations } from "./recommendations";
import {
  getMarketingMemory,
  type MarketingMemorySnapshot,
} from "./marketing-memory";
import { getMarketingWorkerStatus } from "./marketing-worker";
import { buildMarketingReport } from "./marketing-report";
import {
  getWeeklyAdSuggestions,
  type WeeklyAdSuggestions,
} from "./ad-suggestions";
import {
  emptyMarketingBrainBoard,
  getMarketingBrainBoard,
  type MarketingBrainBoard,
} from "./marketing-brain-board";

export type MarketingDeskMemory = {
  memoryScore: number;
  rebuiltAt: string;
  patternCount: number;
  stories: MarketingMemorySnapshot["stories"];
  topPositive: Array<{
    label: string;
    kind: string;
    experience: number;
    why: string[];
  }>;
  topNegative: Array<{
    label: string;
    kind: string;
    experience: number;
    why: string[];
  }>;
  channels: MarketingMemorySnapshot["channels"];
  campaigns: MarketingMemorySnapshot["campaigns"];
  seasons: MarketingMemorySnapshot["seasons"];
  history: MarketingMemorySnapshot["history"];
};

export type MarketingDeskStatus = {
  status: "learning" | "ready" | "waiting" | "error";
  workerStatus: "running" | "idle" | "stopped";
  narrative: string;
  report: ReturnType<typeof buildMarketingReport>;
  dashboard: Awaited<ReturnType<typeof getMarketingDashboard>>;
  topInsights: Awaited<ReturnType<typeof getMarketingInsights>>;
  recommendations: Awaited<ReturnType<typeof getMarketingRecommendations>>;
  memory: MarketingDeskMemory;
  adSuggestions: WeeklyAdSuggestions;
  brain: MarketingBrainBoard;
  topProducts: Array<{
    productId: string;
    name: string;
    score: number;
    views: number;
    purchases: number;
  }>;
  worstProducts: Array<{
    productId: string;
    name: string;
    score: number;
    views: number;
    purchases: number;
  }>;
  traffic: {
    sources: Array<{ source: string; count: number }>;
    campaigns: Array<{ campaign: string; count: number }>;
  };
  errors: string[];
  lastEventAt: string | null;
  lastWorkerTickAt: string | null;
};

function toDeskMemory(memory: MarketingMemorySnapshot): MarketingDeskMemory {
  return {
    memoryScore: memory.stats.memoryScore,
    rebuiltAt: memory.rebuiltAt,
    patternCount: memory.stats.patternCount,
    stories: memory.stories.slice(0, 8),
    topPositive: memory.topPositive.slice(0, 5).map((p) => ({
      label: p.label,
      kind: p.kind,
      experience: p.experience,
      why: p.why,
    })),
    topNegative: memory.topNegative.slice(0, 5).map((p) => ({
      label: p.label,
      kind: p.kind,
      experience: p.experience,
      why: p.why,
    })),
    channels: memory.channels.slice(0, 6),
    campaigns: memory.campaigns.slice(0, 6),
    seasons: memory.seasons,
    history: memory.history.slice(-6),
  };
}

export async function getMarketingDeskStatus(
  storeId = DEFAULT_STORE_ID
): Promise<MarketingDeskStatus> {
  const errors: string[] = [];

  try {
    const [
      dashboard,
      insights,
      recommendations,
      memory,
      worker,
      lastEvent,
      topScores,
      worstScores,
      recent,
      adSuggestions,
      brain,
    ] = await Promise.all([
      getMarketingDashboard(7, storeId),
      getMarketingInsights(7, storeId),
      getMarketingRecommendations(7, storeId),
      getMarketingMemory({ storeId }),
      getMarketingWorkerStatus(),
      prisma.marketingEvent.findFirst({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.marketingProductScore.findMany({
        where: { storeId, rangeDays: 7 },
        orderBy: { overallScore: "desc" },
        take: 5,
        include: { product: { select: { name: true } } },
      }),
      prisma.marketingProductScore.findMany({
        where: { storeId, rangeDays: 7, views: { gte: 3 } },
        orderBy: { overallScore: "asc" },
        take: 5,
        include: { product: { select: { name: true } } },
      }),
      prisma.marketingEvent.findMany({
        where: {
          storeId,
          createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
        },
        select: { source: true, campaign: true },
        take: 2000,
      }),
      getWeeklyAdSuggestions(storeId, 7),
      getMarketingBrainBoard(storeId),
    ]);

    const sourceMap = new Map<string, number>();
    const campaignMap = new Map<string, number>();
    for (const r of recent) {
      const s = r.source || "(direkte/ukjent)";
      sourceMap.set(s, (sourceMap.get(s) || 0) + 1);
      if (r.campaign) {
        campaignMap.set(r.campaign, (campaignMap.get(r.campaign) || 0) + 1);
      }
    }

    const traffic = {
      sources: [...sourceMap.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      campaigns: [...campaignMap.entries()]
        .map(([campaign, count]) => ({ campaign, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };

    const topProducts = topScores.map((s) => ({
      productId: s.productId,
      name: s.product.name,
      score: s.overallScore,
      views: s.views,
      purchases: s.purchases,
    }));
    const worstProducts = worstScores.map((s) => ({
      productId: s.productId,
      name: s.product.name,
      score: s.overallScore,
      views: s.views,
      purchases: s.purchases,
    }));

    const report = buildMarketingReport({
      dashboard,
      insights,
      recommendations,
      memory,
      workerStatus: worker.status,
    });

    let status: MarketingDeskStatus["status"] = "waiting";
    if (!dashboard.empty) {
      status = recommendations.some((r) => r.severity === "urgent")
        ? "learning"
        : "ready";
    }

    return {
      status,
      workerStatus: worker.status,
      narrative: report.summary,
      report,
      dashboard,
      topInsights: insights.slice(0, 8),
      recommendations: recommendations.slice(0, 4),
      memory: toDeskMemory(memory),
      adSuggestions,
      brain,
      topProducts,
      worstProducts,
      traffic,
      errors,
      lastEventAt: lastEvent?.createdAt.toISOString() ?? null,
      lastWorkerTickAt: worker.lastTickAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    const emptyDash = await getMarketingDashboard(7, storeId).catch(() => ({
      rangeDays: 7,
      sessions: 0,
      pageViews: 0,
      viewItem: 0,
      addToCart: 0,
      beginCheckout: 0,
      purchases: 0,
      revenue: 0,
      ctr: null,
      conversionRate: null,
      cartToPurchase: null,
      checkoutToPurchase: null,
      adSpend: 0,
      roas: null,
      cpa: null,
      empty: true,
    }));

    return {
      status: "error",
      workerStatus: "stopped",
      narrative:
        "Marketing Brain kunne ikke lese data. Sjekk migrering (MarketingProductScore / MarketingMemory).",
      report: {
        generatedAt: new Date().toISOString(),
        headline: "Feil",
        summary: message,
        bullets: [],
      },
      dashboard: emptyDash,
      topInsights: [],
      recommendations: [],
      memory: {
        memoryScore: 0,
        rebuiltAt: new Date().toISOString(),
        patternCount: 0,
        stories: [],
        topPositive: [],
        topNegative: [],
        channels: [],
        campaigns: [],
        seasons: [],
        history: [],
      },
      adSuggestions: {
        weekLabel: "Denne uken",
        generatedAt: new Date().toISOString(),
        headline: "Ingen annonseforslag",
        channels: [],
        empty: true,
        emptyReason: message,
        disclaimer:
          "Kun forslag. Jeg lager ikke annonser og publiserer ingenting — du bestemmer.",
      },
      brain: emptyMarketingBrainBoard(),
      topProducts: [],
      worstProducts: [],
      traffic: { sources: [], campaigns: [] },
      errors,
      lastEventAt: null,
      lastWorkerTickAt: null,
    };
  }
}
