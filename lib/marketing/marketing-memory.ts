/**
 * Marketing Memory — long-term marketing experience (same philosophy as Buyer AI Memory).
 *
 * Remembers campaigns, products, seasons, channels, CTR, ROAS, conversion, purchase rate.
 * Additive learning only; never publishes ads or changes budgets.
 * Nudge capped ±3 — memory cannot invent performance.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { cleanProductName } from "@/lib/utils/url-decode";
import { familyLabel, matchFamily } from "@/lib/intelligence/families";

export const MARKETING_MEMORY_NUDGE_MAX = 3;
const LOOKBACK_DAYS = 30;
const HISTORY_MAX = 12;
const MIN_VIEWS_FOR_PATTERN = 4;

export type MarketingMemoryProductRef = {
  productId: string;
  name: string;
  metric: number;
  why: string;
};

export type MarketingMemoryPatternKind =
  | "product"
  | "channel"
  | "campaign"
  | "season"
  | "product_channel"
  | "category_channel"
  | "campaign_product";

export type MarketingMemoryPattern = {
  key: string;
  kind: MarketingMemoryPatternKind;
  label: string;
  productId?: string;
  channel?: string;
  campaign?: string;
  season?: string;
  category?: string;
  views: number;
  carts: number;
  purchases: number;
  revenue: number;
  /** carts / views */
  ctr: number | null;
  /** purchases / views */
  conversionPct: number | null;
  /** purchases / carts */
  purchaseRate: number | null;
  /** revenue / attributed ad spend when spend exists */
  roas: number | null;
  /** Net experience −100..+100 */
  experience: number;
  polarity: "positive" | "negative" | "neutral";
  why: string[];
  samples: number;
  updatedAt: string;
};

export type MarketingMemoryStory = {
  id: string;
  text: string;
  polarity: "positive" | "negative" | "neutral";
  patternKey: string;
  why: string;
};

export type MarketingMemoryHistoryEntry = {
  rebuiltAt: string;
  memoryScore: number;
  events: number;
  storyCount: number;
  topStory?: string;
};

export type MarketingMemorySnapshot = {
  version: 2;
  storeId: string;
  rebuiltAt: string;
  lookbackDays: number;
  /** Legacy lists (Desk / report compat) */
  highCtr: MarketingMemoryProductRef[];
  lowCtr: MarketingMemoryProductRef[];
  highCart: MarketingMemoryProductRef[];
  highConversion: MarketingMemoryProductRef[];
  neverBought: MarketingMemoryProductRef[];
  channelMix: Array<{ source: string; count: number; sharePct: number }>;
  /** Buyer-style patterns */
  patterns: MarketingMemoryPattern[];
  topPositive: MarketingMemoryPattern[];
  topNegative: MarketingMemoryPattern[];
  /** Human stories — «Gamingmus gjorde det bra på TikTok.» */
  stories: MarketingMemoryStory[];
  campaigns: Array<{
    campaign: string;
    views: number;
    carts: number;
    purchases: number;
    revenue: number;
    conversionPct: number | null;
    purchaseRate: number | null;
  }>;
  channels: Array<{
    channel: string;
    views: number;
    carts: number;
    purchases: number;
    revenue: number;
    ctr: number | null;
    conversionPct: number | null;
    purchaseRate: number | null;
    roas: number | null;
    sharePct: number;
  }>;
  seasons: Array<{
    season: string;
    views: number;
    purchases: number;
    revenue: number;
    topChannel: string | null;
  }>;
  history: MarketingMemoryHistoryEntry[];
  stats: {
    productsSeen: number;
    events: number;
    memoryScore: number;
    patternCount: number;
    campaignCount: number;
    channelCount: number;
  };
};

type FunnelAcc = {
  views: number;
  carts: number;
  purchases: number;
  revenue: number;
  productId?: string;
  name?: string;
  category?: string;
  familyId?: string | null;
  familyName?: string;
  channel?: string;
  campaign?: string;
  season?: string;
};

function emptySnapshot(
  storeId: string,
  lookbackDays: number
): MarketingMemorySnapshot {
  return {
    version: 2,
    storeId,
    rebuiltAt: new Date().toISOString(),
    lookbackDays,
    highCtr: [],
    lowCtr: [],
    highCart: [],
    highConversion: [],
    neverBought: [],
    channelMix: [],
    patterns: [],
    topPositive: [],
    topNegative: [],
    stories: [],
    campaigns: [],
    channels: [],
    seasons: [],
    history: [],
    stats: {
      productsSeen: 0,
      events: 0,
      memoryScore: 0,
      patternCount: 0,
      campaignCount: 0,
      channelCount: 0,
    },
  };
}

function emptyFunnel(): FunnelAcc {
  return { views: 0, carts: 0, purchases: 0, revenue: 0 };
}

function bump(
  map: Map<string, FunnelAcc>,
  key: string,
  seed: Partial<FunnelAcc>
): FunnelAcc {
  let row = map.get(key);
  if (!row) {
    row = { ...emptyFunnel(), ...seed };
    map.set(key, row);
  }
  return row;
}

function applyEvent(row: FunnelAcc, event: string, value: number | null) {
  if (event === "view_item") row.views += 1;
  if (event === "add_to_cart") row.carts += 1;
  if (event === "purchase") {
    row.purchases += 1;
    row.revenue += value ?? 0;
  }
}

/** Normalize utm_source → Meta / TikTok / Google / … */
export function normalizeChannel(raw: string | null | undefined): string {
  const s = (raw || "").trim().toLowerCase();
  if (!s || s === "(direkte/ukjent)" || s === "direct" || s === "(direct)") {
    return "Direkte";
  }
  if (
    /meta|facebook|fb|instagram|ig|fbads/.test(s)
  ) {
    return "Meta";
  }
  if (/tiktok|tt\b|bytedance/.test(s)) return "TikTok";
  if (/google|gads|adwords|youtube|gdn/.test(s)) return "Google";
  if (/email|newsletter|klaviyo|mailchimp/.test(s)) return "E-post";
  if (/organic|seo/.test(s)) return "Organisk";
  if (/referral/.test(s)) return "Referral";
  // Title-case unknown sources
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function seasonFromDate(d: Date): string {
  const m = d.getMonth() + 1;
  if (m === 12 || m <= 2) return "Vinter";
  if (m <= 5) return "Vår";
  if (m <= 8) return "Sommer";
  return "Høst";
}

function pct(num: number, den: number): number | null {
  if (!den || den <= 0) return null;
  return Math.round((num / den) * 10000) / 100;
}

function finalizePattern(
  key: string,
  kind: MarketingMemoryPatternKind,
  label: string,
  acc: FunnelAcc,
  attributedSpend: number | null,
  nowIso: string
): MarketingMemoryPattern {
  const ctr = pct(acc.carts, acc.views);
  const conversionPct = pct(acc.purchases, acc.views);
  const purchaseRate = pct(acc.purchases, acc.carts);
  const roas =
    attributedSpend != null && attributedSpend > 0
      ? Math.round((acc.revenue / attributedSpend) * 100) / 100
      : null;

  let experience = 0;
  experience += acc.purchases * 12;
  experience += Math.min(40, acc.revenue / 50);
  experience += acc.carts * 2;
  if (acc.views >= MIN_VIEWS_FOR_PATTERN && acc.purchases === 0) {
    experience -= Math.min(40, acc.views * 2);
  }
  if (ctr != null && ctr >= 8 && conversionPct != null && conversionPct < 1) {
    experience -= 8;
  }
  if (purchaseRate != null && purchaseRate >= 40 && acc.purchases > 0) {
    experience += 10;
  }
  if (roas != null) {
    if (roas >= 2) experience += 15;
    else if (roas < 1) experience -= 12;
  }
  experience = Math.max(-100, Math.min(100, Math.round(experience)));

  const polarity: MarketingMemoryPattern["polarity"] =
    experience >= 12 ? "positive" : experience <= -12 ? "negative" : "neutral";

  const why: string[] = [];
  if (ctr != null) why.push(`CTR ${ctr} %`);
  if (conversionPct != null) why.push(`Konvertering ${conversionPct} %`);
  if (purchaseRate != null && acc.carts > 0) {
    why.push(`Kjøpsrate ${purchaseRate} %`);
  }
  if (roas != null) why.push(`ROAS ~${roas}x`);
  if (acc.purchases > 0) {
    why.push(`${acc.purchases} kjøp · ${Math.round(acc.revenue)} kr`);
  } else if (acc.views > 0) {
    why.push(`${acc.views} visninger, 0 kjøp`);
  }

  return {
    key,
    kind,
    label,
    productId: acc.productId,
    channel: acc.channel,
    campaign: acc.campaign,
    season: acc.season,
    category: acc.familyName || acc.category,
    views: acc.views,
    carts: acc.carts,
    purchases: acc.purchases,
    revenue: Math.round(acc.revenue * 100) / 100,
    ctr,
    conversionPct,
    purchaseRate,
    roas,
    experience,
    polarity,
    why,
    samples: acc.views + acc.carts + acc.purchases,
    updatedAt: nowIso,
  };
}

function buildStories(patterns: MarketingMemoryPattern[]): MarketingMemoryStory[] {
  const stories: MarketingMemoryStory[] = [];
  const seen = new Set<string>();

  const cross = patterns.filter(
    (p) =>
      (p.kind === "product_channel" || p.kind === "category_channel") &&
      p.polarity !== "neutral" &&
      p.samples >= MIN_VIEWS_FOR_PATTERN
  );
  cross.sort((a, b) => Math.abs(b.experience) - Math.abs(a.experience));

  for (const p of cross.slice(0, 10)) {
    if (seen.has(p.key)) continue;
    seen.add(p.key);
    const subject =
      p.kind === "category_channel"
        ? p.category || p.label.split(" på ")[0]
        : p.label.split(" på ")[0];
    const channel = p.channel || "kanalen";
    const text =
      p.polarity === "positive"
        ? `${subject} gjorde det bra på ${channel}.`
        : `${subject} gjorde det dårlig på ${channel}.`;
    stories.push({
      id: `story-${p.key}`,
      text,
      polarity: p.polarity,
      patternKey: p.key,
      why: p.why.join(" · ") || "Basert på first-party funnel.",
    });
  }

  // Campaign stories
  for (const p of patterns
    .filter((x) => x.kind === "campaign" && x.polarity !== "neutral")
    .sort((a, b) => Math.abs(b.experience) - Math.abs(a.experience))
    .slice(0, 4)) {
    if (seen.has(p.key)) continue;
    seen.add(p.key);
    stories.push({
      id: `story-${p.key}`,
      text:
        p.polarity === "positive"
          ? `Kampanje «${p.campaign}» konverterte godt.`
          : `Kampanje «${p.campaign}» leverte svakt.`,
      polarity: p.polarity,
      patternKey: p.key,
      why: p.why.join(" · "),
    });
  }

  // Season stories
  for (const p of patterns
    .filter((x) => x.kind === "season" && x.purchases > 0)
    .sort((a, b) => b.purchases - a.purchases)
    .slice(0, 2)) {
    if (seen.has(p.key)) continue;
    seen.add(p.key);
    stories.push({
      id: `story-${p.key}`,
      text: `${p.season}-sesongen ga ${p.purchases} kjøp i perioden.`,
      polarity: p.polarity === "negative" ? "negative" : "positive",
      patternKey: p.key,
      why: p.why.join(" · "),
    });
  }

  return stories.slice(0, 12);
}

/**
 * Rebuild Marketing Memory from first-party events + daily ad spend.
 */
export async function rebuildMarketingMemory(opts?: {
  storeId?: string;
  lookbackDays?: number;
}): Promise<MarketingMemorySnapshot> {
  const storeId = opts?.storeId || DEFAULT_STORE_ID;
  const lookbackDays = opts?.lookbackDays ?? LOOKBACK_DAYS;
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  const nowIso = new Date().toISOString();

  const prevRow = await prisma.marketingMemory.findUnique({
    where: { storeId },
    select: { snapshot: true },
  });
  const prevSnap = coerceSnapshot(prevRow?.snapshot, storeId, lookbackDays);
  const prevHistory = prevSnap.history || [];

  const [events, dailyStats] = await Promise.all([
    prisma.marketingEvent.findMany({
      where: { storeId, createdAt: { gte: since } },
      select: {
        event: true,
        productId: true,
        productName: true,
        source: true,
        campaign: true,
        value: true,
        createdAt: true,
      },
      take: 25000,
    }),
    prisma.marketingDailyStat.findMany({
      where: { storeId, day: { gte: since } },
      select: { adSpend: true, revenue: true },
    }),
  ]);

  if (events.length === 0) {
    const snap = emptySnapshot(storeId, lookbackDays);
    snap.history = prevHistory.slice(-HISTORY_MAX);
    await persistMemory(storeId, snap);
    return snap;
  }

  const productIds = [
    ...new Set(events.map((e) => e.productId).filter(Boolean) as string[]),
  ];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, category: true },
      })
    : [];
  const productMeta = new Map(
    products.map((p) => {
      const fam = matchFamily(p.name, p.category);
      return [
        p.id,
        {
          name: cleanProductName(p.name),
          category: p.category,
          familyId: fam,
          familyName: fam ? familyLabel(fam) : p.category?.trim() || null,
        },
      ] as const;
    })
  );

  const byProduct = new Map<string, FunnelAcc>();
  const byChannel = new Map<string, FunnelAcc>();
  const byCampaign = new Map<string, FunnelAcc>();
  const bySeason = new Map<string, FunnelAcc>();
  const byProductChannel = new Map<string, FunnelAcc>();
  const byCategoryChannel = new Map<string, FunnelAcc>();
  const byCampaignProduct = new Map<string, FunnelAcc>();
  const sourceRaw = new Map<string, number>();
  const seasonChannel = new Map<string, Map<string, number>>();

  for (const e of events) {
    const channel = normalizeChannel(e.source);
    const season = seasonFromDate(e.createdAt);
    const campaign = e.campaign?.trim() || null;

    sourceRaw.set(
      e.source || "(direkte/ukjent)",
      (sourceRaw.get(e.source || "(direkte/ukjent)") || 0) + 1
    );

    if (
      e.event !== "view_item" &&
      e.event !== "add_to_cart" &&
      e.event !== "purchase"
    ) {
      continue;
    }

    const ch = bump(byChannel, `channel:${channel}`, { channel });
    applyEvent(ch, e.event, e.value);
    ch.channel = channel;

    const se = bump(bySeason, `season:${season}`, { season });
    applyEvent(se, e.event, e.value);
    se.season = season;

    if (!seasonChannel.has(season)) seasonChannel.set(season, new Map());
    const scm = seasonChannel.get(season)!;
    scm.set(channel, (scm.get(channel) || 0) + 1);

    if (campaign) {
      const ca = bump(byCampaign, `campaign:${campaign.toLowerCase()}`, {
        campaign,
      });
      applyEvent(ca, e.event, e.value);
      ca.campaign = campaign;
    }

    if (!e.productId) continue;
    const meta = productMeta.get(e.productId);
    const name =
      meta?.name ||
      (e.productName ? cleanProductName(e.productName) : e.productId);
    const familyName = meta?.familyName || undefined;
    const familyId = meta?.familyId || null;

    const pr = bump(byProduct, `product:${e.productId}`, {
      productId: e.productId,
      name,
      category: meta?.category || undefined,
      familyId,
      familyName,
    });
    applyEvent(pr, e.event, e.value);
    pr.productId = e.productId;
    pr.name = name;

    const pcKey = `pc:${e.productId}|${channel}`;
    const pc = bump(byProductChannel, pcKey, {
      productId: e.productId,
      name,
      channel,
      familyName,
    });
    applyEvent(pc, e.event, e.value);
    pc.productId = e.productId;
    pc.name = name;
    pc.channel = channel;

    if (familyId && familyName) {
      const ccKey = `cc:${familyId}|${channel}`;
      const cc = bump(byCategoryChannel, ccKey, {
        channel,
        familyId,
        familyName,
        category: familyName,
      });
      applyEvent(cc, e.event, e.value);
      cc.channel = channel;
      cc.familyName = familyName;
    }

    if (campaign) {
      const cpKey = `cp:${campaign.toLowerCase()}|${e.productId}`;
      const cp = bump(byCampaignProduct, cpKey, {
        productId: e.productId,
        name,
        campaign,
      });
      applyEvent(cp, e.event, e.value);
      cp.productId = e.productId;
      cp.name = name;
      cp.campaign = campaign;
    }
  }

  const totalAdSpend = dailyStats.reduce((s, d) => s + (d.adSpend || 0), 0);
  const paidChannels = ["Meta", "TikTok", "Google"];
  const paidEventTotal = [...byChannel.entries()]
    .filter(([_, a]) => paidChannels.includes(a.channel || ""))
    .reduce((s, [_, a]) => s + a.views + a.carts + a.purchases, 0);

  function spendForChannel(channel: string | undefined): number | null {
    if (!channel || totalAdSpend <= 0) return null;
    if (!paidChannels.includes(channel)) return null;
    if (paidEventTotal <= 0) return null;
    const ch = byChannel.get(`channel:${channel}`);
    if (!ch) return null;
    const share = (ch.views + ch.carts + ch.purchases) / paidEventTotal;
    return Math.round(totalAdSpend * share * 100) / 100;
  }

  const patterns: MarketingMemoryPattern[] = [];

  for (const [key, acc] of byProduct) {
    if (acc.views + acc.carts + acc.purchases < 2) continue;
    patterns.push(
      finalizePattern(
        key,
        "product",
        acc.name || acc.productId || key,
        acc,
        null,
        nowIso
      )
    );
  }
  for (const [key, acc] of byChannel) {
    patterns.push(
      finalizePattern(
        key,
        "channel",
        acc.channel || key,
        acc,
        spendForChannel(acc.channel),
        nowIso
      )
    );
  }
  for (const [key, acc] of byCampaign) {
    if (acc.views + acc.purchases < 2) continue;
    patterns.push(
      finalizePattern(
        key,
        "campaign",
        acc.campaign || key,
        acc,
        null,
        nowIso
      )
    );
  }
  for (const [key, acc] of bySeason) {
    patterns.push(
      finalizePattern(key, "season", acc.season || key, acc, null, nowIso)
    );
  }
  for (const [key, acc] of byProductChannel) {
    if (acc.views < MIN_VIEWS_FOR_PATTERN && acc.purchases === 0) continue;
    const label = `${acc.name || "Produkt"} på ${acc.channel}`;
    patterns.push(
      finalizePattern(
        key,
        "product_channel",
        label,
        acc,
        spendForChannel(acc.channel),
        nowIso
      )
    );
  }
  for (const [key, acc] of byCategoryChannel) {
    if (acc.views < MIN_VIEWS_FOR_PATTERN && acc.purchases === 0) continue;
    const label = `${acc.familyName || "Kategori"} på ${acc.channel}`;
    patterns.push(
      finalizePattern(
        key,
        "category_channel",
        label,
        acc,
        spendForChannel(acc.channel),
        nowIso
      )
    );
  }
  for (const [key, acc] of byCampaignProduct) {
    if (acc.views + acc.purchases < 3) continue;
    const label = `${acc.name} · ${acc.campaign}`;
    patterns.push(
      finalizePattern(key, "campaign_product", label, acc, null, nowIso)
    );
  }

  patterns.sort((a, b) => Math.abs(b.experience) - Math.abs(a.experience));

  const topPositive = patterns
    .filter((p) => p.polarity === "positive")
    .slice(0, 8);
  const topNegative = patterns
    .filter((p) => p.polarity === "negative")
    .slice(0, 8);
  const stories = buildStories(patterns);

  // Legacy product lists
  const productList = [...byProduct.values()].filter((p) => p.productId);
  const withViews = productList.filter((p) => p.views >= 5);

  const highCtr = [...withViews]
    .map((p) => ({
      ...p,
      ctr: p.views > 0 ? p.carts / p.views : 0,
    }))
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 8)
    .filter((p) => p.ctr > 0)
    .map((p) => ({
      productId: p.productId!,
      name: p.name || p.productId!,
      metric: Math.round(p.ctr * 10000) / 100,
      why: `${p.carts}/${p.views} kurv/visning`,
    }));

  const lowCtr = [...withViews]
    .map((p) => ({
      ...p,
      ctr: p.views > 0 ? p.carts / p.views : 0,
    }))
    .sort((a, b) => a.ctr - b.ctr)
    .slice(0, 8)
    .map((p) => ({
      productId: p.productId!,
      name: p.name || p.productId!,
      metric: Math.round(p.ctr * 10000) / 100,
      why: `${p.carts}/${p.views} kurv/visning`,
    }));

  const highCart = [...productList]
    .sort((a, b) => b.carts - a.carts)
    .slice(0, 8)
    .filter((p) => p.carts > 0)
    .map((p) => ({
      productId: p.productId!,
      name: p.name || p.productId!,
      metric: p.carts,
      why: `${p.carts} add-to-cart`,
    }));

  const highConversion = [...withViews]
    .map((p) => ({
      ...p,
      rate: p.views > 0 ? p.purchases / p.views : 0,
    }))
    .filter((p) => p.purchases > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8)
    .map((p) => ({
      productId: p.productId!,
      name: p.name || p.productId!,
      metric: Math.round(p.rate * 10000) / 100,
      why: `${p.purchases}/${p.views} kjøp/visning`,
    }));

  const neverBought = [...withViews]
    .filter((p) => p.purchases === 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)
    .map((p) => ({
      productId: p.productId!,
      name: p.name || p.productId!,
      metric: p.views,
      why: `${p.views} visninger, 0 kjøp`,
    }));

  const totalSrc = [...sourceRaw.values()].reduce((a, b) => a + b, 0) || 1;
  const channelMix = [...sourceRaw.entries()]
    .map(([source, count]) => ({
      source,
      count,
      sharePct: Math.round((count / totalSrc) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const channels = [...byChannel.values()]
    .map((a) => {
      const volume = a.views + a.carts + a.purchases;
      return {
        channel: a.channel || "Ukjent",
        views: a.views,
        carts: a.carts,
        purchases: a.purchases,
        revenue: Math.round(a.revenue * 100) / 100,
        ctr: pct(a.carts, a.views),
        conversionPct: pct(a.purchases, a.views),
        purchaseRate: pct(a.purchases, a.carts),
        roas: (() => {
          const spend = spendForChannel(a.channel);
          if (spend == null || spend <= 0) return null;
          return Math.round((a.revenue / spend) * 100) / 100;
        })(),
        sharePct: Math.round((volume / totalSrc) * 1000) / 10,
      };
    })
    .sort((a, b) => b.views - a.views);

  const campaigns = [...byCampaign.values()]
    .map((a) => ({
      campaign: a.campaign || "ukjent",
      views: a.views,
      carts: a.carts,
      purchases: a.purchases,
      revenue: Math.round(a.revenue * 100) / 100,
      conversionPct: pct(a.purchases, a.views),
      purchaseRate: pct(a.purchases, a.carts),
    }))
    .sort((a, b) => b.purchases - a.purchases || b.views - a.views)
    .slice(0, 15);

  const seasons = [...bySeason.values()].map((a) => {
    const scm = seasonChannel.get(a.season || "") || new Map();
    const topChannel =
      [...scm.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    return {
      season: a.season || "Ukjent",
      views: a.views,
      purchases: a.purchases,
      revenue: Math.round(a.revenue * 100) / 100,
      topChannel,
    };
  });

  const memoryScore = clampMemoryScore({
    highConv: highConversion.length,
    never: neverBought.length,
    channels: channels.length,
    products: productList.length,
    stories: stories.length,
    patterns: patterns.length,
  });

  const historyEntry: MarketingMemoryHistoryEntry = {
    rebuiltAt: nowIso,
    memoryScore,
    events: events.length,
    storyCount: stories.length,
    topStory: stories[0]?.text,
  };
  const history = [...prevHistory, historyEntry].slice(-HISTORY_MAX);

  const snap: MarketingMemorySnapshot = {
    version: 2,
    storeId,
    rebuiltAt: nowIso,
    lookbackDays,
    highCtr,
    lowCtr,
    highCart,
    highConversion,
    neverBought,
    channelMix,
    patterns: patterns.slice(0, 80),
    topPositive,
    topNegative,
    stories,
    campaigns,
    channels,
    seasons,
    history,
    stats: {
      productsSeen: productList.length,
      events: events.length,
      memoryScore,
      patternCount: patterns.length,
      campaignCount: campaigns.length,
      channelCount: channels.length,
    },
  };

  await persistMemory(storeId, snap);
  return snap;
}

function clampMemoryScore(input: {
  highConv: number;
  never: number;
  channels: number;
  products: number;
  stories: number;
  patterns: number;
}): number {
  if (input.products === 0 && input.patterns === 0) return 0;
  let s = 25;
  s += Math.min(25, input.highConv * 5);
  s += Math.min(15, input.channels * 3);
  s += Math.min(15, input.stories * 4);
  s += Math.min(20, Math.log10(input.patterns + 1) * 12);
  if (input.never > 5) s -= 8;
  return Math.max(0, Math.min(100, Math.round(s)));
}

function coerceSnapshot(
  raw: unknown,
  storeId: string,
  lookbackDays: number
): MarketingMemorySnapshot {
  if (!raw || typeof raw !== "object") {
    return emptySnapshot(storeId, lookbackDays);
  }
  const o = raw as Partial<MarketingMemorySnapshot> & { version?: number };
  const base = emptySnapshot(storeId, lookbackDays);
  return {
    ...base,
    ...o,
    version: 2,
    storeId: o.storeId || storeId,
    lookbackDays: o.lookbackDays ?? lookbackDays,
    highCtr: o.highCtr || [],
    lowCtr: o.lowCtr || [],
    highCart: o.highCart || [],
    highConversion: o.highConversion || [],
    neverBought: o.neverBought || [],
    channelMix: o.channelMix || [],
    patterns: o.patterns || [],
    topPositive: o.topPositive || [],
    topNegative: o.topNegative || [],
    stories: o.stories || [],
    campaigns: o.campaigns || [],
    channels: o.channels || [],
    seasons: o.seasons || [],
    history: o.history || [],
    stats: {
      ...base.stats,
      ...(o.stats || {}),
      patternCount: o.stats?.patternCount ?? o.patterns?.length ?? 0,
      campaignCount: o.stats?.campaignCount ?? o.campaigns?.length ?? 0,
      channelCount: o.stats?.channelCount ?? o.channels?.length ?? 0,
    },
  };
}

async function persistMemory(
  storeId: string,
  snap: MarketingMemorySnapshot
): Promise<void> {
  const json = snap as unknown as Prisma.InputJsonValue;
  await prisma.marketingMemory.upsert({
    where: { storeId },
    create: {
      storeId,
      snapshot: json,
      highCtr: snap.highCtr as unknown as Prisma.InputJsonValue,
      lowCtr: snap.lowCtr as unknown as Prisma.InputJsonValue,
      highCart: snap.highCart as unknown as Prisma.InputJsonValue,
      highConversion: snap.highConversion as unknown as Prisma.InputJsonValue,
      neverBought: snap.neverBought as unknown as Prisma.InputJsonValue,
      channelMix: snap.channelMix as unknown as Prisma.InputJsonValue,
      rebuiltAt: new Date(),
    },
    update: {
      snapshot: json,
      highCtr: snap.highCtr as unknown as Prisma.InputJsonValue,
      lowCtr: snap.lowCtr as unknown as Prisma.InputJsonValue,
      highCart: snap.highCart as unknown as Prisma.InputJsonValue,
      highConversion: snap.highConversion as unknown as Prisma.InputJsonValue,
      neverBought: snap.neverBought as unknown as Prisma.InputJsonValue,
      channelMix: snap.channelMix as unknown as Prisma.InputJsonValue,
      rebuiltAt: new Date(),
    },
  });
}

export async function getMarketingMemory(opts?: {
  storeId?: string;
  forceRebuild?: boolean;
}): Promise<MarketingMemorySnapshot> {
  const storeId = opts?.storeId || DEFAULT_STORE_ID;
  if (opts?.forceRebuild) return rebuildMarketingMemory({ storeId });

  const row = await prisma.marketingMemory.findUnique({ where: { storeId } });
  if (row?.snapshot && typeof row.snapshot === "object") {
    const version = (row.snapshot as { version?: number }).version;
    const snap = coerceSnapshot(row.snapshot, storeId, LOOKBACK_DAYS);
    // Upgrade v1 snapshots to v2 patterns/stories once
    if (version !== 2 && (snap.stats.events > 0 || snap.highCtr.length > 0)) {
      return rebuildMarketingMemory({ storeId });
    }
    return snap;
  }
  return rebuildMarketingMemory({ storeId });
}

/**
 * Small nudge for Marketing Score (−3..+3), same philosophy as Buyer AI memory.
 */
export function scoreMarketingMemoryNudge(
  memory: MarketingMemorySnapshot,
  productId: string
): number {
  if (memory.highConversion.some((p) => p.productId === productId)) {
    return MARKETING_MEMORY_NUDGE_MAX;
  }
  if (memory.highCtr.some((p) => p.productId === productId)) {
    return 2;
  }

  const productPattern = memory.patterns.find(
    (p) => p.kind === "product" && p.productId === productId
  );
  if (productPattern) {
    if (productPattern.polarity === "positive") return 2;
    if (productPattern.polarity === "negative") return -2;
  }

  const cross = memory.patterns.filter(
    (p) =>
      p.kind === "product_channel" &&
      p.productId === productId &&
      p.polarity !== "neutral"
  );
  if (cross.some((p) => p.polarity === "positive")) return 2;
  if (cross.some((p) => p.polarity === "negative")) return -2;

  if (memory.neverBought.some((p) => p.productId === productId)) {
    return -MARKETING_MEMORY_NUDGE_MAX;
  }
  if (memory.lowCtr.some((p) => p.productId === productId)) {
    return -2;
  }
  return 0;
}

/**
 * Explainable memory context for recommendations (insight only).
 */
export function marketingMemoryInsightsForProduct(
  memory: MarketingMemorySnapshot,
  productId: string
): { nudge: number; why: string[]; stories: MarketingMemoryStory[] } {
  const nudge = scoreMarketingMemoryNudge(memory, productId);
  const why: string[] = [];
  const stories = memory.stories.filter((s) =>
    memory.patterns.some(
      (p) =>
        p.key === s.patternKey &&
        (p.productId === productId ||
          (p.kind === "category_channel" &&
            memory.patterns.some(
              (pp) =>
                pp.kind === "product" &&
                pp.productId === productId &&
                pp.category === p.category
            )))
    )
  );

  for (const p of memory.patterns) {
    if (p.productId !== productId) continue;
    if (p.polarity === "neutral") continue;
    why.push(
      p.kind === "product_channel"
        ? `${p.label}: ${p.why[0] || p.polarity}`
        : p.why[0] || p.label
    );
  }

  return { nudge, why: why.slice(0, 4), stories: stories.slice(0, 3) };
}
