/**
 * Marketing Engine — one unit of brain work (like order-engine advance).
 * Aggregates events → scores → memory → insights.
 * Never sends ads. Never changes budgets.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { reaggregateDailyStats } from "./marketing-events";
import {
  getMarketingMemory,
  rebuildMarketingMemory,
  scoreMarketingMemoryNudge,
} from "./marketing-memory";
import { computeMarketingProductScore } from "./marketing-score";
import { cleanProductName } from "@/lib/utils/url-decode";

export type MarketingEngineResult = {
  didWork: boolean;
  storeId: string;
  message: string;
  reaggregatedDays: number;
  productsScored: number;
  memoryScore: number;
  durationMs: number;
};

const PREFERRED_CATEGORIES = [
  "Mobil & Tilbehør",
  "Data & IT",
  "Gaming",
  "TV, Lyd & Bilde",
  "Hjem & Fritid",
];

function storeFitHint(category: string | null | undefined): number {
  if (!category) return 0.5;
  if (PREFERRED_CATEGORIES.some((c) => category.includes(c.split(" ")[0]!))) {
    return 0.8;
  }
  const soft = ["Sport", "Klær", "Sko"];
  if (soft.some((s) => category.includes(s))) return 0.25;
  return 0.55;
}

/**
 * Advance Marketing Brain for one store: rollups → memory → product scores.
 */
export async function advanceMarketingBrain(opts?: {
  storeId?: string;
  rangeDays?: number;
  productLimit?: number;
}): Promise<MarketingEngineResult> {
  const started = Date.now();
  const storeId = opts?.storeId || DEFAULT_STORE_ID;
  const rangeDays = opts?.rangeDays ?? 7;
  const productLimit = opts?.productLimit ?? 80;

  const { days: reaggregatedDays } = await reaggregateDailyStats(
    storeId,
    Math.max(rangeDays, 14)
  );

  const memory = await rebuildMarketingMemory({
    storeId,
    lookbackDays: Math.max(rangeDays, 30),
  });

  const since = new Date();
  since.setDate(since.getDate() - rangeDays);

  const events = await prisma.marketingEvent.findMany({
    where: {
      storeId,
      createdAt: { gte: since },
      productId: { not: null },
      event: { in: ["view_item", "add_to_cart", "begin_checkout", "purchase"] },
    },
    select: {
      event: true,
      productId: true,
      productName: true,
      value: true,
    },
    take: 15000,
  });

  type Agg = {
    views: number;
    carts: number;
    checkouts: number;
    purchases: number;
    revenue: number;
    name: string;
  };
  const byProduct = new Map<string, Agg>();
  for (const e of events) {
    const id = e.productId!;
    const row = byProduct.get(id) || {
      views: 0,
      carts: 0,
      checkouts: 0,
      purchases: 0,
      revenue: 0,
      name: e.productName || id,
    };
    if (e.productName) row.name = e.productName;
    if (e.event === "view_item") row.views += 1;
    if (e.event === "add_to_cart") row.carts += 1;
    if (e.event === "begin_checkout") row.checkouts += 1;
    if (e.event === "purchase") {
      row.purchases += 1;
      row.revenue += e.value ?? 0;
    }
    byProduct.set(id, row);
  }

  // Also score active products with traffic OR top catalog slice for baseline
  const productIds = [...byProduct.keys()].slice(0, productLimit);
  if (productIds.length < productLimit) {
    const extra = await prisma.product.findMany({
      where: {
        storeId,
        isActive: true,
        id: { notIn: productIds },
      },
      select: { id: true },
      take: productLimit - productIds.length,
      orderBy: { updatedAt: "desc" },
    });
    for (const p of extra) {
      if (!byProduct.has(p.id)) {
        byProduct.set(p.id, {
          views: 0,
          carts: 0,
          checkouts: 0,
          purchases: 0,
          revenue: 0,
          name: p.id,
        });
        productIds.push(p.id);
      }
    }
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      supplierPrice: true,
      stock: true,
      isActive: true,
    },
  });

  let productsScored = 0;
  const now = new Date();

  for (const product of products) {
    const agg = byProduct.get(product.id) || {
      views: 0,
      carts: 0,
      checkouts: 0,
      purchases: 0,
      revenue: 0,
      name: product.name,
    };
    const nudge = scoreMarketingMemoryNudge(memory, product.id);
    const scored = computeMarketingProductScore({
      productId: product.id,
      productName: cleanProductName(product.name),
      category: product.category,
      price: product.price,
      supplierPrice: product.supplierPrice,
      stock: product.stock,
      isActive: product.isActive,
      views: agg.views,
      addToCarts: agg.carts,
      beginCheckouts: agg.checkouts,
      purchases: agg.purchases,
      revenue: agg.revenue,
      memoryNudge: nudge,
      storeFitHint: storeFitHint(product.category),
    });

    await prisma.marketingProductScore.upsert({
      where: {
        storeId_productId_rangeDays: {
          storeId,
          productId: product.id,
          rangeDays,
        },
      },
      create: {
        storeId,
        productId: product.id,
        overallScore: scored.overallScore,
        ctrScore: scored.breakdown.ctr,
        conversionScore: scored.breakdown.conversion,
        marginScore: scored.breakdown.margin,
        profitScore: scored.breakdown.profit,
        popularityScore: scored.breakdown.popularity,
        storeFitScore: scored.breakdown.storeFit,
        inventoryScore: scored.breakdown.inventory,
        returnRiskScore: scored.breakdown.returnRisk,
        marketingPotential: scored.breakdown.marketingPotential,
        scores: scored.breakdown,
        reasons: scored.reasons,
        risks: scored.risks,
        views: agg.views,
        addToCarts: agg.carts,
        beginCheckouts: agg.checkouts,
        purchases: agg.purchases,
        revenue: agg.revenue,
        conversionPct: scored.conversionPct,
        memoryNudge: nudge,
        rangeDays,
        computedAt: now,
      },
      update: {
        overallScore: scored.overallScore,
        ctrScore: scored.breakdown.ctr,
        conversionScore: scored.breakdown.conversion,
        marginScore: scored.breakdown.margin,
        profitScore: scored.breakdown.profit,
        popularityScore: scored.breakdown.popularity,
        storeFitScore: scored.breakdown.storeFit,
        inventoryScore: scored.breakdown.inventory,
        returnRiskScore: scored.breakdown.returnRisk,
        marketingPotential: scored.breakdown.marketingPotential,
        scores: scored.breakdown,
        reasons: scored.reasons,
        risks: scored.risks,
        views: agg.views,
        addToCarts: agg.carts,
        beginCheckouts: agg.checkouts,
        purchases: agg.purchases,
        revenue: agg.revenue,
        conversionPct: scored.conversionPct,
        memoryNudge: nudge,
        computedAt: now,
      },
    });
    productsScored += 1;
  }

  // Touch memory read path
  await getMarketingMemory({ storeId });

  const didWork = reaggregatedDays > 0 || productsScored > 0 || memory.stats.events > 0;

  return {
    didWork,
    storeId,
    message: didWork
      ? `Aggregert ${reaggregatedDays} dager, scoret ${productsScored} produkter, memory ${memory.stats.memoryScore}/100`
      : "Ingen nye marketing-events å lære av",
    reaggregatedDays,
    productsScored,
    memoryScore: memory.stats.memoryScore,
    durationMs: Date.now() - started,
  };
}
