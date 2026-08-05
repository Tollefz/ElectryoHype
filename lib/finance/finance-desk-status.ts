/**
 * Finance Brain — Rob's Desk snapshot (butikkens økonomisjef).
 * Separate from Buyer, Marketing, Order. Never auto-prices.
 */

import "server-only";

import { DEFAULT_STORE_ID } from "@/lib/store";
import { getFinanceDashboard } from "./finance-dashboard";
import { getFinanceInsights } from "./finance-insights";
import { getFinanceRecommendations } from "./finance-recommendations";
import { getFinanceMemory } from "./finance-memory";
import { getFinanceWorkerStatus } from "./finance-worker";
import { buildFinanceReport } from "./finance-report";
import {
  daysFromPeriodKey,
  getFinancePeriodBoards,
  periodKeyFromDays,
  type FinancePeriodKey,
  type FinancePeriodSummary,
} from "./finance-periods";

export type FinanceDeskStatus = {
  status: "learning" | "ready" | "waiting" | "error";
  workerStatus: "running" | "idle" | "stopped";
  narrative: string;
  periodKey: FinancePeriodKey;
  periods: FinancePeriodSummary[];
  report: ReturnType<typeof buildFinanceReport>;
  dashboard: Awaited<ReturnType<typeof getFinanceDashboard>>;
  insights: Awaited<ReturnType<typeof getFinanceInsights>>;
  recommendations: Awaited<ReturnType<typeof getFinanceRecommendations>>;
  memory: {
    memoryScore: number;
    rebuiltAt: string;
    stories: Awaited<ReturnType<typeof getFinanceMemory>>["stories"];
  };
  lastWorkerTickAt: string | null;
  errors: string[];
};

function emptyDashboard(rangeDays: number) {
  return {
    rangeDays,
    paidOrders: 0,
    revenue: 0,
    aov: null,
    shippingCollected: 0,
    supplierCost: 0,
    stripeFeesEst: 0,
    grossProfit: 0,
    netProfit: 0,
    roi: null,
    adSpend: 0,
    roas: null,
    cpa: null,
    cac: null,
    uniqueCustomers: 0,
    fxUsdNok: 0,
    fxSource: "fallback",
    highestMargin: [],
    lowestMargin: [],
    profitable: [],
    lossMaking: [],
    empty: true,
  };
}

export async function getFinanceDeskStatus(
  storeId = DEFAULT_STORE_ID,
  rangeDays = 30
): Promise<FinanceDeskStatus> {
  const errors: string[] = [];
  const periodKey = periodKeyFromDays(rangeDays);
  const days = daysFromPeriodKey(periodKey);

  try {
    const [boards, insights, recommendations, memory, worker] =
      await Promise.all([
        getFinancePeriodBoards(storeId),
        getFinanceInsights(days, storeId),
        getFinanceRecommendations(days, storeId),
        getFinanceMemory({ storeId }),
        getFinanceWorkerStatus(),
      ]);

    const dashboard = boards.byKey[periodKey];

    const report = buildFinanceReport({
      dashboard,
      insights,
      recommendations,
      memory,
    });

    let status: FinanceDeskStatus["status"] = "waiting";
    if (!dashboard.empty) {
      status = recommendations.some((r) => r.severity === "urgent")
        ? "learning"
        : "ready";
    }

    return {
      status,
      workerStatus: worker.status,
      narrative: report.summary,
      periodKey,
      periods: boards.periods,
      report,
      dashboard,
      insights: insights.slice(0, 10),
      recommendations: recommendations.slice(0, 4),
      memory: {
        memoryScore: memory.stats.memoryScore,
        rebuiltAt: memory.rebuiltAt,
        stories: memory.stories.slice(0, 8),
      },
      lastWorkerTickAt: worker.lastTickAt,
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    return {
      status: "error",
      workerStatus: "stopped",
      narrative: "Finance Brain kunne ikke lese økonomidata.",
      periodKey,
      periods: [],
      report: {
        generatedAt: new Date().toISOString(),
        headline: "Feil",
        summary: message,
        bullets: [],
      },
      dashboard: emptyDashboard(days),
      insights: [],
      recommendations: [],
      memory: {
        memoryScore: 0,
        rebuiltAt: new Date().toISOString(),
        stories: [],
      },
      lastWorkerTickAt: null,
      errors,
    };
  }
}
