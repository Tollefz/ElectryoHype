/**
 * Marketing Dashboard — funnel rollups from MarketingDailyStat.
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { dayStartUtc } from "./marketing-events";

export type MarketingDashboard = {
  rangeDays: number;
  sessions: number;
  pageViews: number;
  viewItem: number;
  addToCart: number;
  beginCheckout: number;
  purchases: number;
  revenue: number;
  ctr: number | null;
  conversionRate: number | null;
  cartToPurchase: number | null;
  checkoutToPurchase: number | null;
  adSpend: number;
  roas: number | null;
  cpa: number | null;
  empty: boolean;
};

function pct(num: number, den: number): number | null {
  if (!den || den <= 0) return null;
  return Math.round((num / den) * 10000) / 100;
}

export async function getMarketingDashboard(
  rangeDays = 7,
  storeId = DEFAULT_STORE_ID
): Promise<MarketingDashboard> {
  const since = dayStartUtc();
  since.setUTCDate(since.getUTCDate() - (rangeDays - 1));

  const stats = await prisma.marketingDailyStat.findMany({
    where: { storeId, day: { gte: since } },
  });

  const roll = stats.reduce(
    (acc, s) => {
      acc.sessions += s.sessions;
      acc.pageViews += s.pageViews;
      acc.viewItem += s.viewItem;
      acc.addToCart += s.addToCart;
      acc.beginCheckout += s.beginCheckout;
      acc.purchases += s.purchases;
      acc.revenue += s.revenue;
      acc.adSpend += s.adSpend;
      return acc;
    },
    {
      sessions: 0,
      pageViews: 0,
      viewItem: 0,
      addToCart: 0,
      beginCheckout: 0,
      purchases: 0,
      revenue: 0,
      adSpend: 0,
    }
  );

  const empty =
    roll.pageViews === 0 &&
    roll.viewItem === 0 &&
    roll.addToCart === 0 &&
    roll.purchases === 0;

  return {
    rangeDays,
    ...roll,
    ctr: pct(roll.viewItem, roll.pageViews),
    conversionRate: pct(
      roll.purchases,
      Math.max(roll.sessions, roll.pageViews)
    ),
    cartToPurchase: pct(roll.purchases, roll.addToCart),
    checkoutToPurchase: pct(roll.purchases, roll.beginCheckout),
    roas:
      roll.adSpend > 0
        ? Math.round((roll.revenue / roll.adSpend) * 100) / 100
        : null,
    cpa:
      roll.adSpend > 0 && roll.purchases > 0
        ? Math.round((roll.adSpend / roll.purchases) * 100) / 100
        : null,
    empty,
  };
}
