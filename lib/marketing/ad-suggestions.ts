/**
 * AI Ad Suggestions — propose which products to advertise where.
 * Never creates, publishes, or changes ads. Human must act.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { cleanProductName } from "@/lib/utils/url-decode";
import { getStoreDna, scoreStoreDna } from "@/lib/buyer/store-dna";
import { getAiFeedback, scoreAiFeedback } from "@/lib/buyer/ai-feedback";
import { getPreferenceContext } from "@/lib/buyer/admin-preferences";
import {
  getMarketingMemory,
  type MarketingMemorySnapshot,
} from "./marketing-memory";

export type AdChannelId = "google_shopping" | "meta" | "tiktok";

export type AdProductSuggestion = {
  productId: string;
  productName: string;
  marketingScore: number;
  /** Short bullets: CTR, margin, lager, pris, DNA, Memory, Feedback, Score */
  why: string[];
};

export type AdChannelSuggestion = {
  channelId: AdChannelId;
  channelLabel: string;
  products: AdProductSuggestion[];
};

export type WeeklyAdSuggestions = {
  weekLabel: string;
  generatedAt: string;
  headline: string;
  channels: AdChannelSuggestion[];
  empty: boolean;
  emptyReason?: string;
  /** Always remind: suggestion only */
  disclaimer: string;
};

type Candidate = {
  productId: string;
  name: string;
  category: string | null;
  price: number;
  supplierPrice: number | null;
  stock: number;
  overallScore: number;
  ctrScore: number;
  marginScore: number;
  inventoryScore: number;
  views: number;
  addToCarts: number;
  purchases: number;
  ctrPct: number | null;
  reasons: string[];
};

const CHANNELS: Array<{
  id: AdChannelId;
  label: string;
  memoryNames: string[];
  keywords: RegExp;
  pick: number;
}> = [
  {
    id: "google_shopping",
    label: "Google Shopping",
    memoryNames: ["Google"],
    keywords:
      /usb|hub|kabel|adapter|lad|dock|tastatur|keyboard|mus|mouse|ssd|hdd|holder|stativ|webcam|mikrofon/i,
    pick: 2,
  },
  {
    id: "meta",
    label: "Meta",
    memoryNames: ["Meta"],
    keywords:
      /rgb|headset|gaming|lys|led|lampe|webcam|mikrofon|streaming|kontor|desk|musematte/i,
    pick: 1,
  },
  {
    id: "tiktok",
    label: "TikTok",
    memoryNames: ["TikTok"],
    keywords:
      /mini|projektor|projector|gadget|smart|led|rgb|holder|magnet|trådløs|wireless|powerbank|projek/i,
    pick: 1,
  },
];

const DISCLAIMER =
  "Kun forslag. Jeg lager ikke annonser og publiserer ingenting — du bestemmer.";

function marginPct(price: number, supplierPrice: number | null): number | null {
  if (supplierPrice == null || supplierPrice <= 0 || price <= 0) return null;
  return Math.round(((price - supplierPrice) / price) * 1000) / 10;
}

function textHit(hay: string, needles: string[]): boolean {
  const h = hay.toLowerCase();
  return needles.some(
    (n) => n.trim().length >= 3 && h.includes(n.toLowerCase())
  );
}

function memoryChannelBoost(
  memory: MarketingMemorySnapshot,
  productId: string,
  productName: string,
  memoryNames: string[]
): { score: number; why: string | null } {
  let score = 0;
  let why: string | null = null;
  const nameKey = productName.slice(0, 12).toLowerCase();

  for (const story of memory.stories) {
    const mentionsProduct = story.text.toLowerCase().includes(nameKey);
    const mentionsChannel = memoryNames.some((n) =>
      story.text.toLowerCase().includes(n.toLowerCase())
    );
    if (!mentionsProduct && !mentionsChannel) continue;

    if (story.polarity === "positive") {
      const strong =
        mentionsProduct && mentionsChannel
          ? 18
          : mentionsProduct
            ? 8
            : mentionsChannel
              ? 4
              : 0;
      if (strong > score) {
        score = strong;
        why = story.text;
      }
    }
    if (story.polarity === "negative" && mentionsProduct && mentionsChannel) {
      score = Math.min(score, -20);
      why = story.text;
    }
  }

  for (const p of memory.patterns) {
    if (p.productId !== productId) continue;
    if (p.kind !== "product_channel" && p.kind !== "category_channel") continue;
    if (!memoryNames.some((n) => (p.channel || "") === n)) continue;
    if (p.polarity === "positive") {
      score = Math.max(score, 16);
      why = why || `${p.label}: ${p.why[0] || "positiv erfaring"}`;
    }
    if (p.polarity === "negative") {
      score = Math.min(score, -18);
      why = why || `${p.label}: ${p.why[0] || "svak erfaring"}`;
    }
  }

  if (memory.neverBought.some((n) => n.productId === productId)) score -= 10;
  if (memory.highConversion.some((n) => n.productId === productId)) score += 6;

  return { score, why };
}

function channelKeywordBoost(
  name: string,
  category: string | null,
  re: RegExp
): number {
  if (re.test(name) || (category && re.test(category))) return 8;
  return 0;
}

function buildWhy(
  c: Candidate,
  chLabel: string,
  dnaWhy: string | undefined,
  memWhy: string | null,
  fbWhy: string | undefined
): string[] {
  const m = marginPct(c.price, c.supplierPrice);
  const why: string[] = [];
  why.push(`Marketing Score ${Math.round(c.overallScore)}`);
  if (c.ctrPct != null) {
    why.push(
      `CTR-proxy ${c.ctrPct} % (${c.addToCarts}/${c.views} kurv/visning)`
    );
  } else {
    why.push(`CTR-score ${Math.round(c.ctrScore)}`);
  }
  if (m != null) why.push(`Margin ~${m} %`);
  else why.push(`Margin-score ${Math.round(c.marginScore)}`);
  why.push(
    c.stock > 5
      ? `Lager OK (${c.stock} stk)`
      : `Lager ${c.stock} stk — ikke overskalér`
  );
  why.push(`Pris ${Math.round(c.price)} kr`);
  if (dnaWhy) why.push(`Store DNA: ${dnaWhy.replace(/^[✔⚠]\s*/, "")}`);
  if (memWhy) why.push(`Memory: ${memWhy}`);
  if (fbWhy && !fbWhy.includes("Ingen butikkprestasjon")) {
    why.push(`Feedback: ${fbWhy.replace(/^[✔⚠]\s*/, "")}`);
  }
  if (c.reasons[0]) why.push(c.reasons[0]);
  // Ensure channel context is visible when thin
  if (why.length < 4) {
    why.push(`Passer ${chLabel} basert på score og lager`);
  }
  return why.slice(0, 7);
}

/**
 * Build this week's AI ad suggestions per channel.
 * Suggestions only — never publishes.
 */
export async function getWeeklyAdSuggestions(
  storeId = DEFAULT_STORE_ID,
  rangeDays = 7
): Promise<WeeklyAdSuggestions> {
  const generatedAt = new Date().toISOString();
  const weekLabel = "Denne uken";

  const [memory, dna, feedback, prefs, scores] = await Promise.all([
    getMarketingMemory({ storeId }),
    getStoreDna({ storeId }),
    getAiFeedback({ storeId }),
    getPreferenceContext(storeId),
    prisma.marketingProductScore.findMany({
      where: {
        storeId,
        rangeDays,
        overallScore: { gte: 45 },
      },
      orderBy: { overallScore: "desc" },
      take: 40,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            price: true,
            supplierPrice: true,
            stock: true,
            isActive: true,
          },
        },
      },
    }),
  ]);

  const candidates: Candidate[] = scores
    .filter((s) => s.product?.isActive)
    .map((s) => {
      const reasonsRaw = Array.isArray(s.reasons) ? s.reasons : [];
      const reasons = reasonsRaw.filter(
        (r): r is string => typeof r === "string"
      );
      const ctrPct =
        s.views > 0
          ? Math.round((s.addToCarts / s.views) * 10000) / 100
          : null;
      return {
        productId: s.productId,
        name: cleanProductName(s.product.name),
        category: s.product.category,
        price: s.product.price,
        supplierPrice: s.product.supplierPrice,
        stock: s.product.stock,
        overallScore: s.overallScore,
        ctrScore: s.ctrScore,
        marginScore: s.marginScore,
        inventoryScore: s.inventoryScore,
        views: s.views,
        addToCarts: s.addToCarts,
        purchases: s.purchases,
        ctrPct,
        reasons,
      };
    });

  if (candidates.length === 0) {
    return {
      weekLabel,
      generatedAt,
      headline: "Ingen annonseforslag ennå",
      channels: CHANNELS.map((c) => ({
        channelId: c.id,
        channelLabel: c.label,
        products: [],
      })),
      empty: true,
      emptyReason:
        "Jeg trenger Marketing Score fra worker (trafikk + aktive produkter) før jeg foreslår annonser.",
      disclaimer: DISCLAIMER,
    };
  }

  const used = new Set<string>();
  const channels: AdChannelSuggestion[] = [];

  for (const ch of CHANNELS) {
    const ranked = candidates
      .filter((c) => !used.has(c.productId) && c.stock > 0)
      .map((c) => {
        const dnaN = scoreStoreDna(dna, {
          title: c.name,
          categoryHint: c.category,
          priceNOK: c.price,
        });
        const fb = scoreAiFeedback(feedback, {
          title: c.name,
          categoryHint: c.category,
        });
        const mem = memoryChannelBoost(
          memory,
          c.productId,
          c.name,
          ch.memoryNames
        );
        const kw = channelKeywordBoost(c.name, c.category, ch.keywords);
        const m = marginPct(c.price, c.supplierPrice);

        let fit = c.overallScore;
        fit += mem.score;
        fit += dnaN.nudge * 4;
        fit += fb.nudge * 5;
        fit += kw;
        fit += Math.min(8, c.inventoryScore / 12);
        fit += Math.min(6, c.marginScore / 15);

        if (
          textHit(c.name, prefs.dislikes) ||
          textHit(c.category || "", prefs.dislikes)
        ) {
          fit -= 25;
        }
        if (
          textHit(c.name, prefs.likes) ||
          textHit(c.category || "", prefs.likes)
        ) {
          fit += 10;
        }

        if (ch.id === "google_shopping") {
          if (c.marginScore >= 60) fit += 6;
          if (c.stock >= 3) fit += 4;
          if (m != null && m >= 50) fit += 5;
        }
        if (ch.id === "meta") {
          const visual = dnaN.matchedTraits.some(
            (t) =>
              t.id === "rgb" || t.id === "gaming" || t.id === "streaming"
          );
          if (visual) fit += 8;
        }
        if (ch.id === "tiktok") {
          if (c.ctrScore >= 55) fit += 6;
          fit += Math.min(8, Math.log10(c.views + 1) * 4);
        }

        if (mem.score <= -15) fit -= 30;

        const why = buildWhy(
          c,
          ch.label,
          dnaN.why[0],
          mem.why,
          fb.nudge !== 0 ? fb.why[0] : fb.why.find((w) => !w.includes("Ingen"))
        );

        return { c, fit, why };
      })
      .filter((r) => r.fit >= 40)
      .sort((a, b) => b.fit - a.fit);

    const picks: AdProductSuggestion[] = [];
    for (const row of ranked) {
      if (picks.length >= ch.pick) break;
      picks.push({
        productId: row.c.productId,
        productName: row.c.name,
        marketingScore: Math.round(row.c.overallScore),
        why: row.why,
      });
      used.add(row.c.productId);
    }

    if (picks.length === 0) {
      const fallback = candidates
        .filter((c) => c.stock > 0 && !used.has(c.productId))
        .sort((a, b) => b.overallScore - a.overallScore)[0];
      if (fallback) {
        const m = marginPct(fallback.price, fallback.supplierPrice);
        picks.push({
          productId: fallback.productId,
          productName: fallback.name,
          marketingScore: Math.round(fallback.overallScore),
          why: [
            `Marketing Score ${Math.round(fallback.overallScore)}`,
            m != null
              ? `Margin ~${m} %`
              : `Margin-score ${Math.round(fallback.marginScore)}`,
            `Lager ${fallback.stock} stk`,
            `Pris ${Math.round(fallback.price)} kr`,
            `Beste tilgjengelige kandidat for ${ch.label} denne uken`,
          ],
        });
        used.add(fallback.productId);
      }
    }

    channels.push({
      channelId: ch.id,
      channelLabel: ch.label,
      products: picks,
    });
  }

  const any = channels.some((c) => c.products.length > 0);

  return {
    weekLabel,
    generatedAt,
    headline: any
      ? `${weekLabel} anbefaler AI`
      : "Ingen annonseforslag denne uken",
    channels,
    empty: !any,
    emptyReason: any
      ? undefined
      : "Ingen produkter passet kriteriene (score, lager, memory).",
    disclaimer: DISCLAIMER,
  };
}
