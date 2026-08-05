/**
 * Finance Engine — one unit of Finance Brain work.
 * Never changes prices or spends money.
 */

import "server-only";

import { DEFAULT_STORE_ID } from "@/lib/store";
import { rebuildFinanceMemory } from "./finance-memory";
import { appendFinanceEvent } from "./finance-events";
import { getFinanceDashboard } from "./finance-dashboard";

export async function advanceFinanceBrain(opts?: {
  storeId?: string;
  lookbackDays?: number;
}): Promise<{
  memoryScore: number;
  grossProfit: number;
  netProfit: number;
  lossCount: number;
  message: string;
}> {
  const storeId = opts?.storeId || DEFAULT_STORE_ID;
  const lookbackDays = opts?.lookbackDays ?? 30;

  const [memory, dash] = await Promise.all([
    rebuildFinanceMemory({ storeId, lookbackDays }),
    getFinanceDashboard(lookbackDays, storeId),
  ]);

  const message = `Finance Memory ${memory.stats.memoryScore}/100 · brutto ${Math.round(dash.grossProfit)} kr · ${memory.stats.lossCount} lavmargin/tap`;

  await appendFinanceEvent({
    type: "brain_tick",
    message,
    meta: {
      memoryScore: memory.stats.memoryScore,
      grossProfit: dash.grossProfit,
      netProfit: dash.netProfit,
    },
  });

  return {
    memoryScore: memory.stats.memoryScore,
    grossProfit: dash.grossProfit,
    netProfit: dash.netProfit,
    lossCount: memory.stats.lossCount,
    message,
  };
}
