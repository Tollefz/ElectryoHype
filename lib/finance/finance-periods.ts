/**
 * Finance period boards — today / week / month for the economy chief Desk.
 */

import "server-only";

import { DEFAULT_STORE_ID } from "@/lib/store";
import {
  getFinanceDashboard,
  type FinanceDashboard,
} from "./finance-dashboard";

export type FinancePeriodKey = "today" | "week" | "month";

export type FinancePeriodSummary = {
  key: FinancePeriodKey;
  label: string;
  rangeDays: number;
  revenue: number;
  grossProfit: number;
  netProfit: number;
  paidOrders: number;
  roi: number | null;
  empty: boolean;
};

const PERIODS: Array<{
  key: FinancePeriodKey;
  label: string;
  rangeDays: number;
}> = [
  { key: "today", label: "I dag", rangeDays: 1 },
  { key: "week", label: "Uke", rangeDays: 7 },
  { key: "month", label: "Måned", rangeDays: 30 },
];

function toSummary(
  key: FinancePeriodKey,
  label: string,
  dash: FinanceDashboard
): FinancePeriodSummary {
  return {
    key,
    label,
    rangeDays: dash.rangeDays,
    revenue: dash.revenue,
    grossProfit: dash.grossProfit,
    netProfit: dash.netProfit,
    paidOrders: dash.paidOrders,
    roi: dash.roi,
    empty: dash.empty,
  };
}

/**
 * Load today / week / month dashboards in parallel.
 */
export async function getFinancePeriodBoards(
  storeId = DEFAULT_STORE_ID
): Promise<{
  periods: FinancePeriodSummary[];
  byKey: Record<FinancePeriodKey, FinanceDashboard>;
}> {
  const [today, week, month] = await Promise.all(
    PERIODS.map((p) => getFinanceDashboard(p.rangeDays, storeId))
  );
  const boards = [today, week, month];
  const byKey = {
    today,
    week,
    month,
  } as Record<FinancePeriodKey, FinanceDashboard>;
  const periods = PERIODS.map((p, i) =>
    toSummary(p.key, p.label, boards[i])
  );
  return { periods, byKey };
}

export function periodKeyFromDays(days: number): FinancePeriodKey {
  if (days <= 1) return "today";
  if (days <= 7) return "week";
  return "month";
}

export function daysFromPeriodKey(key: FinancePeriodKey): number {
  if (key === "today") return 1;
  if (key === "week") return 7;
  return 30;
}
