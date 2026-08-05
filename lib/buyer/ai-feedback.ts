/**
 * AI Feedback Layer — learn from how the store actually performs.
 *
 * Additive only. Never removes Merch / Memory / DNA / Focus.
 * Capped nudge (±FEEDBACK_NUDGE_MAX) — small bonus or penalty, never absolute.
 *
 * See AI_FEEDBACK.md
 */

import "server-only";

import {
  CatalogVersionKind,
  PaymentStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { familyLabel, matchFamily } from "@/lib/intelligence/families";

export const AI_FEEDBACK_SETTING_KEY = "buyer_store_feedback";
export const FEEDBACK_NUDGE_MAX = 2;
const STALE_MS = 30 * 60_000;
const LOOKBACK_DAYS = 90;
const HISTORY_MAX = 24;

export type FeedbackExperience = {
  key: string;
  kind: "family" | "supplier";
  label: string;
  published: number;
  notPublished: number;
  deleted: number;
  unitsSold: number;
  orderLines: number;
  refunds: number;
  revenueNOK: number;
  avgMarginPct: number | null;
  avgStockDays: number | null;
  priceChanges: number;
  /** 0–100 performance confidence */
  confidence: number;
  polarity: "positive" | "negative" | "neutral";
  learning: boolean;
  why: string[];
  /** Ready for clicks/views later */
  views: number | null;
  clicks: number | null;
  conversionPct: number | null;
};

export type FeedbackHistoryPoint = {
  at: string;
  avgConfidence: number;
  byFamily: Array<{ key: string; label: string; confidence: number }>;
};

export type AiFeedbackSnapshot = {
  version: 1;
  rebuiltAt: string;
  lookbackDays: number;
  experiences: FeedbackExperience[];
  topPerforming: FeedbackExperience[];
  worstPerforming: FeedbackExperience[];
  learningNow: FeedbackExperience[];
  positive: FeedbackExperience[];
  negative: FeedbackExperience[];
  confidenceOverTime: FeedbackHistoryPoint[];
  familyHistory: Array<{
    key: string;
    label: string;
    points: Array<{ at: string; confidence: number }>;
  }>;
  stubs: {
    clicksViews: string;
    trueReturns: string;
  };
};

export type AiFeedbackNudge = {
  nudge: number;
  feedbackScore: number;
  why: string[];
  matched: Array<{ key: string; label: string; confidence: number }>;
};

type Acc = {
  kind: "family" | "supplier";
  label: string;
  published: number;
  notPublished: number;
  deleted: number;
  unitsSold: number;
  orderLines: number;
  refunds: number;
  revenueNOK: number;
  marginSum: number;
  marginN: number;
  stockDaysSum: number;
  stockDaysN: number;
  priceChanges: number;
  recentActivity: number;
};

function emptyAcc(kind: "family" | "supplier", label: string): Acc {
  return {
    kind,
    label,
    published: 0,
    notPublished: 0,
    deleted: 0,
    unitsSold: 0,
    orderLines: 0,
    refunds: 0,
    revenueNOK: 0,
    marginSum: 0,
    marginN: 0,
    stockDaysSum: 0,
    stockDaysN: 0,
    priceChanges: 0,
    recentActivity: 0,
  };
}

function bump(
  map: Map<string, Acc>,
  key: string,
  kind: "family" | "supplier",
  label: string
): Acc {
  let a = map.get(key);
  if (!a) {
    a = emptyAcc(kind, label);
    map.set(key, a);
  }
  return a;
}

function tagsArchived(tags: unknown): boolean {
  const s =
    typeof tags === "string"
      ? tags
      : Array.isArray(tags)
        ? tags.map(String).join(",")
        : "";
  return /archived/i.test(s);
}

function computeConfidence(a: Acc): {
  confidence: number;
  polarity: FeedbackExperience["polarity"];
  why: string[];
} {
  let score = 50;
  const why: string[] = [];

  if (a.unitsSold >= 10) {
    score += 18;
    why.push(`Solgt bra (${a.unitsSold} enheter)`);
  } else if (a.unitsSold >= 3) {
    score += 10;
    why.push(`Solgt OK (${a.unitsSold} enheter)`);
  } else if (a.published >= 3 && a.unitsSold === 0) {
    score -= 14;
    why.push("Publisert men nesten ingen salg");
  } else if (a.published >= 1 && a.unitsSold === 0) {
    score -= 6;
    why.push("Lite/ingen salg ennå");
  }

  if (a.orderLines > 0) {
    const refundRate = a.refunds / Math.max(1, a.orderLines);
    if (refundRate >= 0.25) {
      score -= 16;
      why.push(`Høy refusjon/retur-proxy (${Math.round(refundRate * 100)}%)`);
    } else if (refundRate > 0 && refundRate < 0.1) {
      score += 4;
      why.push("Få refusjoner");
    }
  }

  if (a.marginN > 0) {
    const avg = a.marginSum / a.marginN;
    if (avg >= 50) {
      score += 12;
      why.push(`Høy margin (~${Math.round(avg)}%)`);
    } else if (avg >= 35) {
      score += 6;
      why.push(`Solid margin (~${Math.round(avg)}%)`);
    } else if (avg < 25) {
      score -= 12;
      why.push(`Lav margin (~${Math.round(avg)}%)`);
    }
  }

  if (a.stockDaysN > 0) {
    const days = a.stockDaysSum / a.stockDaysN;
    if (days > 90 && a.unitsSold < 2) {
      score -= 10;
      why.push(`Lang lagerstid (~${Math.round(days)} dager)`);
    } else if (days < 21 && a.unitsSold >= 3) {
      score += 5;
      why.push("Rask rotasjon");
    }
  }

  if (a.priceChanges >= 5) {
    score -= 4;
    why.push(`Mange prisendringer (${a.priceChanges})`);
  }

  if (a.deleted >= 3) {
    score -= 8;
    why.push(`Slettet/arkivert ${a.deleted}×`);
  }

  if (a.published >= 5 && a.unitsSold >= 5 && (a.refunds === 0 || a.refunds / a.orderLines < 0.1)) {
    why.unshift("Positiv butikkprestasjon → høyere confidence");
  }
  if (a.published >= 5 && a.unitsSold < 2) {
    why.unshift("Svak butikkprestasjon → lavere confidence");
  }

  const confidence = Math.max(0, Math.min(100, Math.round(score)));
  const polarity: FeedbackExperience["polarity"] =
    confidence >= 62 ? "positive" : confidence <= 42 ? "negative" : "neutral";

  return { confidence, polarity, why: why.slice(0, 4) };
}

function finalize(key: string, a: Acc): FeedbackExperience {
  const { confidence, polarity, why } = computeConfidence(a);
  const learning = a.recentActivity > 0;
  return {
    key,
    kind: a.kind,
    label: a.label,
    published: a.published,
    notPublished: a.notPublished,
    deleted: a.deleted,
    unitsSold: a.unitsSold,
    orderLines: a.orderLines,
    refunds: a.refunds,
    revenueNOK: Math.round(a.revenueNOK),
    avgMarginPct:
      a.marginN > 0 ? Math.round((a.marginSum / a.marginN) * 10) / 10 : null,
    avgStockDays:
      a.stockDaysN > 0
        ? Math.round((a.stockDaysSum / a.stockDaysN) * 10) / 10
        : null,
    priceChanges: a.priceChanges,
    confidence,
    polarity,
    learning,
    why,
    views: null,
    clicks: null,
    conversionPct: null,
  };
}

function parseSnapshot(raw: unknown): AiFeedbackSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as AiFeedbackSnapshot;
  if (v.version !== 1 || !Array.isArray(v.experiences)) return null;
  return v;
}

function emptySnapshot(): AiFeedbackSnapshot {
  return {
    version: 1,
    rebuiltAt: new Date().toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    experiences: [],
    topPerforming: [],
    worstPerforming: [],
    learningNow: [],
    positive: [],
    negative: [],
    confidenceOverTime: [],
    familyHistory: [],
    stubs: {
      clicksViews:
        "Klikk/visninger/PDP-konvertering er ikke lagret i DB ennå — stub.",
      trueReturns:
        "Ekte retur-modul mangler; bruker paymentStatus=refunded som proxy.",
    },
  };
}

/**
 * Rebuild performance experiences from orders, catalog, refunds, price churn.
 */
export async function rebuildAiFeedback(opts?: {
  storeId?: string | null;
}): Promise<AiFeedbackSnapshot> {
  const now = new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60_000);
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const map = new Map<string, Acc>();

  const prev = parseSnapshot(
    (
      await prisma.setting.findUnique({
        where: { key: AI_FEEDBACK_SETTING_KEY },
      })
    )?.value
  );

  const [products, orderItems, priceVersions, candidates] = await Promise.all([
    prisma.product.findMany({
      where: {
        ...(opts?.storeId ? { storeId: opts.storeId } : {}),
        OR: [
          { createdAt: { gte: since } },
          { updatedAt: { gte: since } },
          { isActive: true },
        ],
      },
      select: {
        id: true,
        name: true,
        category: true,
        isActive: true,
        tags: true,
        price: true,
        supplierPrice: true,
        supplierName: true,
        stock: true,
        createdAt: true,
        updatedAt: true,
        lastInventoryCheck: true,
      },
      take: 5000,
    }),
    prisma.orderItem.findMany({
      where: {
        createdAt: { gte: since },
        order: {
          isTestOrder: false,
          paymentStatus: {
            in: [PaymentStatus.paid, PaymentStatus.refunded],
          },
          ...(opts?.storeId ? { storeId: opts.storeId } : {}),
        },
      },
      select: {
        quantity: true,
        price: true,
        createdAt: true,
        productId: true,
        product: {
          select: {
            name: true,
            category: true,
            supplierName: true,
            price: true,
            supplierPrice: true,
          },
        },
        order: {
          select: { paymentStatus: true, createdAt: true },
        },
      },
      take: 8000,
    }),
    prisma.productCatalogVersion.findMany({
      where: {
        kind: CatalogVersionKind.price,
        createdAt: { gte: since },
      },
      select: {
        createdAt: true,
        product: {
          select: {
            name: true,
            category: true,
            supplierName: true,
          },
        },
      },
      take: 3000,
      orderBy: { createdAt: "desc" },
    }),
    prisma.buyerCandidate.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: ["rejected", "dismissed", "ranked", "imported"] },
      },
      select: {
        title: true,
        supplier: true,
        status: true,
        createdAt: true,
      },
      take: 3000,
    }),
  ]);

  for (const p of products) {
    const title = p.name || "";
    const familyId = matchFamily(title, p.category) || "unknown";
    const supplier = String(p.supplierName || "ukjent").toLowerCase();
    const familyAcc = bump(
      map,
      `family:${familyId}`,
      "family",
      familyId === "unknown" ? "Ukjent familie" : familyLabel(familyId)
    );
    const supplierAcc = bump(
      map,
      `supplier:${supplier}`,
      "supplier",
      `Leverandør ${p.supplierName || "ukjent"}`
    );

    for (const a of [familyAcc, supplierAcc]) {
      if (p.isActive) a.published += 1;
      else if (tagsArchived(p.tags) || !p.isActive) a.deleted += 1;
      else a.notPublished += 1;

      if (p.price > 0 && p.supplierPrice != null && p.supplierPrice > 0) {
        const m = ((p.price - p.supplierPrice) / p.price) * 100;
        a.marginSum += m;
        a.marginN += 1;
      }

      const anchor = p.lastInventoryCheck || p.createdAt;
      const days = (now.getTime() - anchor.getTime()) / (24 * 60 * 60_000);
      if (p.stock > 0 && Number.isFinite(days)) {
        a.stockDaysSum += days;
        a.stockDaysN += 1;
      }

      if (p.updatedAt >= since30) a.recentActivity += 1;
    }
  }

  for (const line of orderItems) {
    const p = line.product;
    const title = p?.name || "";
    const familyId = matchFamily(title, p?.category) || "unknown";
    const supplier = String(p?.supplierName || "ukjent").toLowerCase();
    const familyAcc = bump(
      map,
      `family:${familyId}`,
      "family",
      familyId === "unknown" ? "Ukjent familie" : familyLabel(familyId)
    );
    const supplierAcc = bump(
      map,
      `supplier:${supplier}`,
      "supplier",
      `Leverandør ${p?.supplierName || "ukjent"}`
    );

    const qty = line.quantity || 0;
    const rev = qty * (line.price || 0);
    const refunded = line.order.paymentStatus === PaymentStatus.refunded;

    for (const a of [familyAcc, supplierAcc]) {
      a.orderLines += 1;
      if (refunded) {
        a.refunds += 1;
      } else {
        a.unitsSold += qty;
        a.revenueNOK += rev;
      }
      if (line.createdAt >= since30) a.recentActivity += 1;

      if (p?.price && p.supplierPrice && p.price > 0) {
        const m = ((p.price - p.supplierPrice) / p.price) * 100;
        a.marginSum += m;
        a.marginN += 1;
      }
    }
  }

  for (const v of priceVersions) {
    const title = v.product?.name || "";
    const familyId = matchFamily(title, v.product?.category) || "unknown";
    const supplier = String(v.product?.supplierName || "ukjent").toLowerCase();
    bump(
      map,
      `family:${familyId}`,
      "family",
      familyId === "unknown" ? "Ukjent familie" : familyLabel(familyId)
    ).priceChanges += 1;
    bump(
      map,
      `supplier:${supplier}`,
      "supplier",
      `Leverandør ${v.product?.supplierName || "ukjent"}`
    ).priceChanges += 1;
  }

  for (const c of candidates) {
    if (c.status !== "rejected" && c.status !== "dismissed") continue;
    const familyId = matchFamily(c.title || "", null) || "unknown";
    const supplier = String(c.supplier || "ukjent").toLowerCase();
    bump(
      map,
      `family:${familyId}`,
      "family",
      familyId === "unknown" ? "Ukjent familie" : familyLabel(familyId)
    ).notPublished += 1;
    bump(
      map,
      `supplier:${supplier}`,
      "supplier",
      `Leverandør ${c.supplier || "ukjent"}`
    ).notPublished += 1;
  }

  const experiences = [...map.entries()]
    .map(([key, a]) => finalize(key, a))
    .filter((e) => e.published + e.unitsSold + e.orderLines + e.deleted >= 1)
    .sort((a, b) => b.confidence - a.confidence);

  const topPerforming = experiences
    .filter((e) => e.kind === "family" && e.polarity === "positive")
    .slice(0, 10);
  const worstPerforming = [...experiences]
    .filter((e) => e.kind === "family")
    .sort((a, b) => a.confidence - b.confidence)
    .filter((e) => e.polarity === "negative" || e.confidence < 48)
    .slice(0, 10);
  const learningNow = experiences
    .filter((e) => e.learning)
    .slice(0, 12);
  const positive = experiences.filter((e) => e.polarity === "positive").slice(0, 12);
  const negative = experiences
    .filter((e) => e.polarity === "negative")
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 12);

  const avgConfidence =
    experiences.length > 0
      ? Math.round(
          experiences.reduce((s, e) => s + e.confidence, 0) / experiences.length
        )
      : 50;

  const history = [...(prev?.confidenceOverTime || [])];
  const lastAt = history[0] ? new Date(history[0].at).getTime() : 0;
  const point: FeedbackHistoryPoint = {
    at: now.toISOString(),
    avgConfidence,
    byFamily: experiences
      .filter((e) => e.kind === "family")
      .slice(0, 20)
      .map((e) => ({
        key: e.key,
        label: e.label,
        confidence: e.confidence,
      })),
  };
  if (!lastAt || Date.now() - lastAt > 20 * 60 * 60_000) {
    history.unshift(point);
  } else {
    history[0] = point;
  }
  while (history.length > HISTORY_MAX) history.pop();

  // Per-family confidence history
  const familyKeys = experiences
    .filter((e) => e.kind === "family")
    .slice(0, 15)
    .map((e) => e.key);
  const familyHistory = familyKeys.map((key) => {
    const label =
      experiences.find((e) => e.key === key)?.label || key;
    const points: Array<{ at: string; confidence: number }> = [];
    for (const h of [...history].reverse()) {
      const row = h.byFamily.find((f) => f.key === key);
      if (row) points.push({ at: h.at, confidence: row.confidence });
    }
    const cur = experiences.find((e) => e.key === key);
    if (cur && (!points.length || points[points.length - 1]!.at !== point.at)) {
      points.push({ at: point.at, confidence: cur.confidence });
    }
    return { key, label, points };
  });

  const snapshot: AiFeedbackSnapshot = {
    version: 1,
    rebuiltAt: now.toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    experiences: experiences.slice(0, 120),
    topPerforming,
    worstPerforming,
    learningNow,
    positive,
    negative,
    confidenceOverTime: history,
    familyHistory,
    stubs: emptySnapshot().stubs,
  };

  await prisma.setting.upsert({
    where: { key: AI_FEEDBACK_SETTING_KEY },
    create: {
      key: AI_FEEDBACK_SETTING_KEY,
      value: snapshot as unknown as Prisma.InputJsonValue,
    },
    update: { value: snapshot as unknown as Prisma.InputJsonValue },
  });

  return snapshot;
}

export async function getAiFeedback(opts?: {
  storeId?: string | null;
  forceRebuild?: boolean;
}): Promise<AiFeedbackSnapshot> {
  if (!opts?.forceRebuild) {
    const row = await prisma.setting.findUnique({
      where: { key: AI_FEEDBACK_SETTING_KEY },
    });
    const cached = parseSnapshot(row?.value);
    if (cached) {
      const age = Date.now() - new Date(cached.rebuiltAt).getTime();
      if (Number.isFinite(age) && age < STALE_MS) return cached;
    }
  }
  try {
    return await rebuildAiFeedback({ storeId: opts?.storeId });
  } catch {
    return emptySnapshot();
  }
}

export function scoreAiFeedback(
  feedback: AiFeedbackSnapshot,
  candidate: {
    title: string;
    supplier?: string | null;
    categoryHint?: string | null;
  }
): AiFeedbackNudge {
  const familyId = matchFamily(candidate.title, candidate.categoryHint) || "unknown";
  const supplier = String(candidate.supplier || "").toLowerCase();
  const keys = [
    `family:${familyId}`,
    supplier ? `supplier:${supplier}` : null,
  ].filter(Boolean) as string[];

  const byKey = new Map(feedback.experiences.map((e) => [e.key, e]));
  const matched: FeedbackExperience[] = [];
  for (const k of keys) {
    const e = byKey.get(k);
    if (e) matched.push(e);
  }

  if (matched.length === 0) {
    return {
      nudge: 0,
      feedbackScore: 50,
      why: ["Ingen butikkprestasjon å lære av for dette mønsteret ennå"],
      matched: [],
    };
  }

  let weighted = 0;
  let wSum = 0;
  const why: string[] = [];
  for (const e of matched) {
    const w = e.kind === "family" ? 1.3 : 1;
    weighted += e.confidence * w;
    wSum += w;
    for (const line of e.why) {
      if (!why.includes(line)) why.push(line);
    }
  }
  const avg = wSum > 0 ? weighted / wSum : 50;
  // Map confidence 0–100 → nudge −2…+2 (50 = neutral)
  const nudge = Math.max(
    -FEEDBACK_NUDGE_MAX,
    Math.min(
      FEEDBACK_NUDGE_MAX,
      Math.round(((avg - 50) / 50) * FEEDBACK_NUDGE_MAX)
    )
  );

  if (nudge > 0) {
    why.unshift("✔ Butikkprestasjon øker confidence litt");
  } else if (nudge < 0) {
    why.unshift("⚠ Butikkprestasjon senker confidence litt");
  }

  return {
    nudge,
    feedbackScore: Math.round(avg),
    why: why.slice(0, 4),
    matched: matched.map((e) => ({
      key: e.key,
      label: e.label,
      confidence: e.confidence,
    })),
  };
}

export function applyAiFeedbackNudge(
  butikkscore: number,
  nudge: AiFeedbackNudge
): {
  butikkscore: number;
  feedbackNudge: number;
  feedbackScore: number;
  feedbackWhy: string[];
} {
  const capped = Math.max(
    -FEEDBACK_NUDGE_MAX,
    Math.min(FEEDBACK_NUDGE_MAX, nudge.nudge)
  );
  return {
    butikkscore: Math.max(0, Math.min(100, Math.round(butikkscore + capped))),
    feedbackNudge: capped,
    feedbackScore: nudge.feedbackScore,
    feedbackWhy: nudge.why,
  };
}
