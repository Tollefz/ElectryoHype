/**
 * Marketing Brain board for Rob's Desk — facts only, no LLM.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { cleanProductName } from "@/lib/utils/url-decode";
import { normalizeChannel } from "./marketing-memory";

export type BrainProductFact = {
  productId: string;
  name: string;
  fact: string;
  metric?: number;
  metricLabel?: string;
};

export type MarketingBrainBoard = {
  generatedAt: string;
  trafficLast24h: {
    events: number;
    sessions: number;
    pageViews: number;
    viewItem: number;
    addToCart: number;
    beginCheckout: number;
    purchases: number;
    revenue: number;
    fact: string;
  };
  bestChannel: {
    channel: string;
    events: number;
    sharePct: number;
    purchases: number;
    fact: string;
  } | null;
  mostPopular: BrainProductFact[];
  highestConversion: BrainProductFact[];
  lowestConversion: BrainProductFact[];
  recommendPromote: BrainProductFact[];
  recommendPause: BrainProductFact[];
  highMarginHighCtr: BrainProductFact[];
  needsBetterImages: BrainProductFact[];
  needsBetterDescription: BrainProductFact[];
};

function parseImages(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(String).filter(Boolean);
    } catch {
      return raw.trim() ? [raw] : [];
    }
  }
  return [];
}

function plainLen(html: string | null | undefined): number {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function marginPct(price: number, supplierPrice: number | null): number | null {
  if (supplierPrice == null || supplierPrice <= 0 || price <= 0) return null;
  return Math.round(((price - supplierPrice) / price) * 1000) / 10;
}

function pct(num: number, den: number): number | null {
  if (!den || den <= 0) return null;
  return Math.round((num / den) * 10000) / 100;
}

/**
 * Build fact-only Marketing Brain panels for Rob's Desk.
 */
export async function getMarketingBrainBoard(
  storeId = DEFAULT_STORE_ID
): Promise<MarketingBrainBoard> {
  const generatedAt = new Date().toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [events24h, events7d, scores, activeProducts] = await Promise.all([
    prisma.marketingEvent.findMany({
      where: { storeId, createdAt: { gte: since24h } },
      select: {
        event: true,
        sessionId: true,
        source: true,
        value: true,
        productId: true,
      },
      take: 15000,
    }),
    prisma.marketingEvent.findMany({
      where: {
        storeId,
        createdAt: { gte: since7d },
        productId: { not: null },
        event: { in: ["view_item", "add_to_cart", "purchase"] },
      },
      select: {
        event: true,
        productId: true,
        productName: true,
        source: true,
        value: true,
      },
      take: 20000,
    }),
    prisma.marketingProductScore.findMany({
      where: { storeId, rangeDays: 7 },
      orderBy: { overallScore: "desc" },
      take: 80,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            supplierPrice: true,
            stock: true,
            isActive: true,
            images: true,
            description: true,
            shortDescription: true,
          },
        },
      },
    }),
    prisma.product.findMany({
      where: {
        isActive: true,
        OR: [{ storeId }, { storeId: null }],
      },
      select: {
        id: true,
        name: true,
        images: true,
        description: true,
        shortDescription: true,
        price: true,
        supplierPrice: true,
        stock: true,
      },
      take: 200,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  // —— Trafikk siste døgn ——
  const sessions = new Set(
    events24h.map((e) => e.sessionId).filter(Boolean) as string[]
  );
  let pageViews = 0;
  let viewItem = 0;
  let addToCart = 0;
  let beginCheckout = 0;
  let purchases = 0;
  let revenue = 0;
  for (const e of events24h) {
    if (e.event === "page_view") pageViews += 1;
    if (e.event === "view_item") viewItem += 1;
    if (e.event === "add_to_cart") addToCart += 1;
    if (e.event === "begin_checkout") beginCheckout += 1;
    if (e.event === "purchase") {
      purchases += 1;
      revenue += e.value ?? 0;
    }
  }
  const trafficLast24h = {
    events: events24h.length,
    sessions: sessions.size,
    pageViews,
    viewItem,
    addToCart,
    beginCheckout,
    purchases,
    revenue: Math.round(revenue * 100) / 100,
    fact:
      events24h.length === 0
        ? "Ingen first-party events siste 24 timer."
        : `${sessions.size} sessions · ${viewItem} produktvisninger · ${addToCart} handlekurver · ${purchases} kjøp.`,
  };

  // —— Beste kanal (24h, fallback 7d sources from events24h+7d) ——
  const channelEvents =
    events24h.length > 0
      ? events24h
      : await prisma.marketingEvent.findMany({
          where: { storeId, createdAt: { gte: since7d } },
          select: {
            event: true,
            source: true,
            value: true,
            productId: true,
            sessionId: true,
          },
          take: 15000,
        });

  const byChannel = new Map<
    string,
    { events: number; purchases: number; views: number }
  >();
  for (const e of channelEvents) {
    const ch = normalizeChannel(e.source);
    const row = byChannel.get(ch) || { events: 0, purchases: 0, views: 0 };
    row.events += 1;
    if (e.event === "purchase") row.purchases += 1;
    if (e.event === "view_item") row.views += 1;
    byChannel.set(ch, row);
  }
  const totalChEvents =
    [...byChannel.values()].reduce((s, r) => s + r.events, 0) || 1;
  const rankedChannels = [...byChannel.entries()].sort(
    (a, b) =>
      b[1].purchases - a[1].purchases || b[1].events - a[1].events
  );
  const bestChEntry =
    rankedChannels.find(([name]) => name !== "Direkte") || rankedChannels[0];
  let bestChannel: MarketingBrainBoard["bestChannel"] = null;
  if (bestChEntry) {
    const [channel, row] = bestChEntry;
    const sharePct = Math.round((row.events / totalChEvents) * 1000) / 10;
    bestChannel = {
      channel,
      events: row.events,
      sharePct,
      purchases: row.purchases,
      fact: `${channel}: ${row.events} events (${sharePct} %), ${row.purchases} kjøp${
        events24h.length > 0 ? " siste døgn" : " siste 7 dager"
      }.`,
    };
  }

  // —— Product funnel from 7d events ——
  const funnel = new Map<
    string,
    { name: string; views: number; carts: number; purchases: number; revenue: number }
  >();
  for (const e of events7d) {
    if (!e.productId) continue;
    const row = funnel.get(e.productId) || {
      name: e.productName || e.productId,
      views: 0,
      carts: 0,
      purchases: 0,
      revenue: 0,
    };
    if (e.productName) row.name = cleanProductName(e.productName);
    if (e.event === "view_item") row.views += 1;
    if (e.event === "add_to_cart") row.carts += 1;
    if (e.event === "purchase") {
      row.purchases += 1;
      row.revenue += e.value ?? 0;
    }
    funnel.set(e.productId, row);
  }

  // Enrich names from scores
  for (const s of scores) {
    const f = funnel.get(s.productId);
    if (f && s.product?.name) f.name = cleanProductName(s.product.name);
  }

  const mostPopular: BrainProductFact[] = [...funnel.entries()]
    .map(([productId, f]) => ({
      productId,
      name: f.name,
      fact: `${f.views} visninger · ${f.carts} kurv · ${f.purchases} kjøp (7d)`,
      metric: f.views,
      metricLabel: "visninger",
    }))
    .sort((a, b) => (b.metric || 0) - (a.metric || 0))
    .slice(0, 5);

  const withEnoughViews = [...funnel.entries()].filter(
    ([, f]) => f.views >= 5
  );

  const highestConversion: BrainProductFact[] = withEnoughViews
    .map(([productId, f]) => {
      const conversionPct = pct(f.purchases, f.views) ?? 0;
      return {
        productId,
        name: f.name,
        fact: `${conversionPct} % konvertering (${f.purchases}/${f.views})`,
        metric: conversionPct,
        metricLabel: "%",
      };
    })
    .filter((p) => (p.metric || 0) > 0)
    .sort((a, b) => (b.metric || 0) - (a.metric || 0))
    .slice(0, 5);

  const lowestConversion: BrainProductFact[] = withEnoughViews
    .map(([productId, f]) => {
      const conversionPct = pct(f.purchases, f.views) ?? 0;
      return {
        productId,
        name: f.name,
        fact: `${conversionPct} % konvertering (${f.purchases}/${f.views})`,
        metric: conversionPct,
        metricLabel: "%",
      };
    })
    .sort((a, b) => (a.metric || 0) - (b.metric || 0))
    .slice(0, 5);

  // —— Promote / pause from Marketing Score + funnel facts ——
  const recommendPromote: BrainProductFact[] = scores
    .filter(
      (s) =>
        s.product?.isActive &&
        s.product.stock > 0 &&
        s.overallScore >= 65 &&
        (s.purchases > 0 || s.addToCarts >= 2)
    )
    .slice(0, 5)
    .map((s) => {
      const m = marginPct(s.product.price, s.product.supplierPrice);
      return {
        productId: s.productId,
        name: cleanProductName(s.product.name),
        fact: `Marketing Score ${Math.round(s.overallScore)} · ${s.purchases} kjøp · lager ${s.product.stock}${
          m != null ? ` · margin ~${m} %` : ""
        }`,
        metric: s.overallScore,
        metricLabel: "score",
      };
    });

  const recommendPause: BrainProductFact[] = scores
    .filter(
      (s) =>
        s.product?.isActive &&
        s.views >= 8 &&
        s.purchases === 0
    )
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)
    .map((s) => ({
      productId: s.productId,
      name: cleanProductName(s.product.name),
      fact: `${s.views} visninger, 0 kjøp · score ${Math.round(s.overallScore)} — pause eller fiks før mer adspend`,
      metric: s.views,
      metricLabel: "visninger",
    }));

  // Also from funnel if scores empty
  if (recommendPause.length === 0) {
    for (const [productId, f] of [...funnel.entries()]
      .filter(([, x]) => x.views >= 8 && x.purchases === 0)
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, 5)) {
      recommendPause.push({
        productId,
        name: f.name,
        fact: `${f.views} visninger, 0 kjøp (7d) — pause annonsering`,
        metric: f.views,
        metricLabel: "visninger",
      });
    }
  }

  const highMarginHighCtr: BrainProductFact[] = scores
    .filter((s) => s.product?.isActive)
    .map((s) => {
      const m = marginPct(s.product.price, s.product.supplierPrice);
      const ctr =
        s.views > 0
          ? pct(s.addToCarts, s.views)
          : null;
      return { s, m, ctr };
    })
    .filter(
      (x) =>
        x.m != null &&
        x.m >= 45 &&
        x.ctr != null &&
        x.ctr >= 5 &&
        x.s.views >= 5
    )
    .sort((a, b) => (b.m || 0) + (b.ctr || 0) - ((a.m || 0) + (a.ctr || 0)))
    .slice(0, 5)
    .map(({ s, m, ctr }) => ({
      productId: s.productId,
      name: cleanProductName(s.product.name),
      fact: `Margin ~${m} % · CTR-proxy ${ctr} % (${s.addToCarts}/${s.views}) · score ${Math.round(s.overallScore)}`,
      metric: m ?? undefined,
      metricLabel: "% margin",
    }));

  // —— Content quality facts (prefer products with traffic) ——
  const viewsByProduct = new Map(
    [...funnel.entries()].map(([id, f]) => [id, f.views])
  );

  const needsBetterImages: BrainProductFact[] = activeProducts
    .map((p) => {
      const imgs = parseImages(p.images);
      return { p, count: imgs.length, views: viewsByProduct.get(p.id) || 0 };
    })
    .filter((x) => x.count < 3)
    .sort((a, b) => b.views - a.views || a.count - b.count)
    .slice(0, 5)
    .map(({ p, count, views }) => ({
      productId: p.id,
      name: cleanProductName(p.name),
      fact:
        count === 0
          ? `0 bilder${views ? ` · ${views} visninger (7d)` : ""}`
          : `${count} bilde(r) (mål ≥ 3)${views ? ` · ${views} visninger` : ""}`,
      metric: count,
      metricLabel: "bilder",
    }));

  const needsBetterDescription: BrainProductFact[] = activeProducts
    .map((p) => {
      const len = plainLen(p.description) + plainLen(p.shortDescription);
      return { p, len, views: viewsByProduct.get(p.id) || 0 };
    })
    .filter((x) => x.len < 150)
    .sort((a, b) => b.views - a.views || a.len - b.len)
    .slice(0, 5)
    .map(({ p, len, views }) => ({
      productId: p.id,
      name: cleanProductName(p.name),
      fact: `${len} tegn i beskrivelse (mål ≥ 150)${views ? ` · ${views} visninger` : ""}`,
      metric: len,
      metricLabel: "tegn",
    }));

  return {
    generatedAt,
    trafficLast24h,
    bestChannel,
    mostPopular,
    highestConversion,
    lowestConversion,
    recommendPromote,
    recommendPause,
    highMarginHighCtr,
    needsBetterImages,
    needsBetterDescription,
  };
}

export function emptyMarketingBrainBoard(): MarketingBrainBoard {
  return {
    generatedAt: new Date().toISOString(),
    trafficLast24h: {
      events: 0,
      sessions: 0,
      pageViews: 0,
      viewItem: 0,
      addToCart: 0,
      beginCheckout: 0,
      purchases: 0,
      revenue: 0,
      fact: "Ingen data.",
    },
    bestChannel: null,
    mostPopular: [],
    highestConversion: [],
    lowestConversion: [],
    recommendPromote: [],
    recommendPause: [],
    highMarginHighCtr: [],
    needsBetterImages: [],
    needsBetterDescription: [],
  };
}
