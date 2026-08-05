/**
 * AI Store Memory — long-term product-hunt experience (not chat memory).
 *
 * Additive layer only: never changes Discovery, Merch Brain, or Worker.
 * Nudge is capped (±MEMORY_NUDGE_MAX) so memory cannot rescue a bad product.
 *
 * See AI_MEMORY.md
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { productFingerprint } from "@/lib/buyer/fingerprint";
import { familyLabel, matchFamily } from "@/lib/intelligence/families";

export const AI_MEMORY_SETTING_KEY = "buyer_ai_memory";
/** Hard cap — memory may only nudge Butikkscore slightly. */
export const MEMORY_NUDGE_MAX = 3;
const LOOKBACK_DAYS = 90;
const STALE_MS = 30 * 60_000;
const HIGH_MARGIN_PCT = 50;
const LOW_MARGIN_PCT = 30;
const BAD_DELIVERY_DAYS = 12;

export type AiMemoryPatternKind =
  | "family"
  | "supplier"
  | "fingerprint"
  | "margin"
  | "delivery";

export type AiMemoryPattern = {
  key: string;
  kind: AiMemoryPatternKind;
  label: string;
  published: number;
  rejected: number;
  liked: number;
  disliked: number;
  deleted: number;
  highMargin: number;
  lowMargin: number;
  priceErrors: number;
  badDelivery: number;
  avgMarginPct: number | null;
  avgDeliveryDays: number | null;
  /** Net experience signal −100..+100 */
  experience: number;
  polarity: "positive" | "negative" | "neutral";
  why: string[];
  samples: number;
  updatedAt: string;
};

export type AiMemoryStats = {
  published: number;
  rejected: number;
  liked: number;
  disliked: number;
  deleted: number;
  learnedLast30d: number;
  patternCount: number;
  /** Aggregate store memory health 0–100 */
  memoryScore: number;
};

export type AiMemorySnapshot = {
  version: 1;
  rebuiltAt: string;
  lookbackDays: number;
  stats: AiMemoryStats;
  patterns: AiMemoryPattern[];
  topPositive: AiMemoryPattern[];
  topNegative: AiMemoryPattern[];
};

export type AiMemoryNudge = {
  /** −MEMORY_NUDGE_MAX .. +MEMORY_NUDGE_MAX */
  nudge: number;
  /** Display score 0–100 for Mission Control */
  memoryScore: number;
  why: string[];
  matchedPatterns: Array<{ key: string; label: string; polarity: string }>;
};

type Acc = {
  kind: AiMemoryPatternKind;
  label: string;
  published: number;
  rejected: number;
  liked: number;
  disliked: number;
  deleted: number;
  highMargin: number;
  lowMargin: number;
  priceErrors: number;
  badDelivery: number;
  marginSum: number;
  marginN: number;
  deliverySum: number;
  deliveryN: number;
};

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function emptyAcc(kind: AiMemoryPatternKind, label: string): Acc {
  return {
    kind,
    label,
    published: 0,
    rejected: 0,
    liked: 0,
    disliked: 0,
    deleted: 0,
    highMargin: 0,
    lowMargin: 0,
    priceErrors: 0,
    badDelivery: 0,
    marginSum: 0,
    marginN: 0,
    deliverySum: 0,
    deliveryN: 0,
  };
}

function bump(map: Map<string, Acc>, key: string, kind: AiMemoryPatternKind, label: string): Acc {
  let a = map.get(key);
  if (!a) {
    a = emptyAcc(kind, label);
    map.set(key, a);
  }
  return a;
}

function parseDeliveryDays(snap: Record<string, unknown>): number | null {
  if (typeof snap.deliveryDays === "number") return snap.deliveryDays;
  const hint = String(
    snap.deliveryTime || snap.deliveryHint || snap.shippingHint || ""
  );
  const m = hint.match(/(\d+)\s*[-–]?\s*(\d+)?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  if (!Number.isFinite(a)) return null;
  return Math.round((a + (Number.isFinite(b) ? b : a)) / 2);
}

function finalizePattern(key: string, a: Acc, nowIso: string): AiMemoryPattern {
  const samples =
    a.published +
    a.rejected +
    a.liked +
    a.disliked +
    a.deleted +
    a.highMargin +
    a.lowMargin +
    a.priceErrors +
    a.badDelivery;

  let experience = 0;
  experience += a.published * 8;
  experience += a.liked * 6;
  experience += a.highMargin * 3;
  experience -= a.rejected * 5;
  experience -= a.disliked * 6;
  experience -= a.deleted * 4;
  experience -= a.lowMargin * 3;
  experience -= a.priceErrors * 4;
  experience -= a.badDelivery * 3;
  experience = Math.max(-100, Math.min(100, experience));

  const why: string[] = [];
  if (a.published > 0) {
    why.push(
      a.published >= 3
        ? `Publisert ${a.published} ganger — positiv erfaring`
        : `Publisert ${a.published} gang(er)`
    );
  }
  if (a.liked > 0) why.push(`Admin likte lignende ${a.liked}×`);
  if (a.rejected > 0 || a.disliked > 0) {
    why.push(
      `Admin avviser ofte lignende produkter (${a.rejected + a.disliked}×)`
    );
  }
  if (a.deleted > 0) why.push(`Slettet/arkivert ${a.deleted}× etter import`);
  if (a.highMargin > 0) why.push(`Høy margin observert ${a.highMargin}×`);
  if (a.lowMargin > 0) why.push(`Dårlig margin observert ${a.lowMargin}×`);
  if (a.priceErrors > 0) why.push(`Prisfeil ${a.priceErrors}×`);
  if (a.badDelivery > 0) why.push(`Dårlig levering ${a.badDelivery}×`);
  if (a.kind === "supplier" && a.published >= 3 && experience > 20) {
    why.unshift("AI har tidligere hatt gode erfaringer med denne leverandøren");
  }
  if (a.kind === "supplier" && experience < -15) {
    why.unshift("Leverandøren har ofte gitt svake eller avviste produkter");
  }

  const polarity: AiMemoryPattern["polarity"] =
    experience >= 15 ? "positive" : experience <= -15 ? "negative" : "neutral";

  return {
    key,
    kind: a.kind,
    label: a.label,
    published: a.published,
    rejected: a.rejected,
    liked: a.liked,
    disliked: a.disliked,
    deleted: a.deleted,
    highMargin: a.highMargin,
    lowMargin: a.lowMargin,
    priceErrors: a.priceErrors,
    badDelivery: a.badDelivery,
    avgMarginPct:
      a.marginN > 0 ? Math.round((a.marginSum / a.marginN) * 10) / 10 : null,
    avgDeliveryDays:
      a.deliveryN > 0 ? Math.round((a.deliverySum / a.deliveryN) * 10) / 10 : null,
    experience,
    polarity,
    why: why.slice(0, 4),
    samples,
    updatedAt: nowIso,
  };
}

function emptySnapshot(): AiMemorySnapshot {
  const now = new Date().toISOString();
  return {
    version: 1,
    rebuiltAt: now,
    lookbackDays: LOOKBACK_DAYS,
    stats: {
      published: 0,
      rejected: 0,
      liked: 0,
      disliked: 0,
      deleted: 0,
      learnedLast30d: 0,
      patternCount: 0,
      memoryScore: 50,
    },
    patterns: [],
    topPositive: [],
    topNegative: [],
  };
}

/**
 * Rebuild experience memory from hunts, feedback, and catalog outcomes.
 * Read-heavy; writes only to Setting. Does not touch AI decision code.
 */
export async function rebuildAiMemory(opts?: {
  storeId?: string | null;
}): Promise<AiMemorySnapshot> {
  const now = new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60_000);
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const nowIso = now.toISOString();
  const map = new Map<string, Acc>();

  let published = 0;
  let rejected = 0;
  let liked = 0;
  let disliked = 0;
  let deleted = 0;
  let learnedLast30d = 0;

  const [candidates, products, feedback] = await Promise.all([
    prisma.buyerCandidate.findMany({
      where: { createdAt: { gte: since } },
      select: {
        title: true,
        supplier: true,
        fingerprint: true,
        status: true,
        pricing: true,
        snapshot: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 4000,
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: {
        OR: [
          { createdAt: { gte: since } },
          { updatedAt: { gte: since } },
        ],
        supplierProductId: { not: null },
      },
      select: {
        name: true,
        supplierName: true,
        supplierAccountId: true,
        isActive: true,
        tags: true,
        price: true,
        supplierPrice: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 3000,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.aiFeedbackEvent.findMany({
      where: {
        engine: "digital_buyer",
        subjectType: "buyer_candidate",
        createdAt: { gte: since },
      },
      select: {
        kind: true,
        createdAt: true,
        humanResult: true,
        aiProposal: true,
        metadata: true,
      },
      take: 2000,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  for (const c of candidates) {
    const title = (c.title || "").trim();
    const snap = asObj(c.snapshot);
    const pricing = asObj(c.pricing);
    const economic = asObj(pricing.economic);
    const category =
      (typeof snap.categoryHint === "string" && snap.categoryHint) ||
      (typeof snap.category === "string" && snap.category) ||
      null;
    const familyId = matchFamily(title, category) || "unknown";
    const fp =
      (c.fingerprint && String(c.fingerprint)) ||
      productFingerprint(title) ||
      null;
    const supplier = String(c.supplier || "ukjent");
    const margin =
      num(pricing.estimatedMarginPct) ??
      num(pricing.marginPct) ??
      num(economic.marginPct);
    const deliveryDays = parseDeliveryDays(snap);
    const flags = Array.isArray(economic.flags)
      ? economic.flags.map(String)
      : [];

    const familyAcc = bump(
      map,
      `family:${familyId}`,
      "family",
      familyId === "unknown" ? "Ukjent familie" : familyLabel(familyId)
    );
    const supplierAcc = bump(
      map,
      `supplier:${supplier.toLowerCase()}`,
      "supplier",
      `Leverandør ${supplier}`
    );
    const fpAcc = fp
      ? bump(map, `fp:${fp.slice(0, 48)}`, "fingerprint", title.slice(0, 60) || fp)
      : null;

    const touchMargin = (a: Acc) => {
      if (margin == null) return;
      a.marginSum += margin;
      a.marginN += 1;
      if (margin >= HIGH_MARGIN_PCT) a.highMargin += 1;
      if (margin < LOW_MARGIN_PCT) a.lowMargin += 1;
    };
    const touchDelivery = (a: Acc) => {
      if (deliveryDays == null) return;
      a.deliverySum += deliveryDays;
      a.deliveryN += 1;
      if (deliveryDays >= BAD_DELIVERY_DAYS) a.badDelivery += 1;
    };
    const touchFlags = (a: Acc) => {
      if (
        flags.includes("price_changed") ||
        flags.includes("economic_control_failed") ||
        flags.includes("sale_below_landed") ||
        flags.includes("fx_stale") ||
        flags.includes("negative_margin")
      ) {
        a.priceErrors += 1;
      }
    };

    for (const a of [familyAcc, supplierAcc, fpAcc].filter(Boolean) as Acc[]) {
      touchMargin(a);
      touchDelivery(a);
      touchFlags(a);
    }

    if (c.status === "rejected" || c.status === "dismissed") {
      rejected += 1;
      familyAcc.rejected += 1;
      supplierAcc.rejected += 1;
      if (fpAcc) fpAcc.rejected += 1;
      if (c.updatedAt >= since30 || c.createdAt >= since30) learnedLast30d += 1;
    }
    if (c.status === "imported" || c.status === "queued") {
      // counted as publish intent; confirmed via Product below
      if (c.createdAt >= since30) learnedLast30d += 1;
    }
  }

  for (const p of products) {
    const title = (p.name || "").trim();
    const familyId = matchFamily(title, null) || "unknown";
    const supplier = String(p.supplierName || p.supplierAccountId || "ukjent");
    const familyAcc = bump(
      map,
      `family:${familyId}`,
      "family",
      familyId === "unknown" ? "Ukjent familie" : familyLabel(familyId)
    );
    const supplierAcc = bump(
      map,
      `supplier:${supplier.toLowerCase()}`,
      "supplier",
      `Leverandør ${supplier}`
    );
    const fp = productFingerprint(title);
    const fpAcc = fp
      ? bump(map, `fp:${fp.slice(0, 48)}`, "fingerprint", title.slice(0, 60))
      : null;

    const tagsRaw = p.tags;
    const archived =
      typeof tagsRaw === "string" &&
      (tagsRaw.includes("archived") || tagsRaw.includes('"archived"'));

    if (p.isActive) {
      published += 1;
      familyAcc.published += 1;
      supplierAcc.published += 1;
      if (fpAcc) fpAcc.published += 1;
      if (p.createdAt >= since30 || p.updatedAt >= since30) learnedLast30d += 1;
    } else if (archived || !p.isActive) {
      deleted += 1;
      familyAcc.deleted += 1;
      supplierAcc.deleted += 1;
      if (fpAcc) fpAcc.deleted += 1;
      if (p.updatedAt >= since30) learnedLast30d += 1;
    }

    if (
      p.price != null &&
      p.supplierPrice != null &&
      p.supplierPrice > 0
    ) {
      const marginPct =
        ((p.price - p.supplierPrice) / p.price) * 100;
      for (const a of [familyAcc, supplierAcc, fpAcc].filter(Boolean) as Acc[]) {
        a.marginSum += marginPct;
        a.marginN += 1;
        if (marginPct >= HIGH_MARGIN_PCT) a.highMargin += 1;
        if (marginPct < LOW_MARGIN_PCT) a.lowMargin += 1;
      }
    }
  }

  for (const ev of feedback) {
    const human = asObj(ev.humanResult);
    const proposal = asObj(ev.aiProposal);
    const meta = asObj(ev.metadata);
    const features = Array.isArray(human.features)
      ? human.features.map(String)
      : Array.isArray(meta.features)
        ? meta.features.map(String)
        : [];
    const title = String(proposal.title || human.title || "");
    const familyFromFeat = features.find((f) => f.startsWith("family:"));
    const familyId =
      (familyFromFeat && familyFromFeat.slice(7)) ||
      matchFamily(title, null) ||
      "unknown";

    const familyAcc = bump(
      map,
      `family:${familyId}`,
      "family",
      familyId === "unknown" ? "Ukjent familie" : familyLabel(familyId)
    );

    if (ev.kind === "approve") {
      liked += 1;
      familyAcc.liked += 1;
    } else if (ev.kind === "reject") {
      disliked += 1;
      familyAcc.disliked += 1;
    }
    if (ev.createdAt >= since30) learnedLast30d += 1;
  }

  const patterns = [...map.entries()]
    .map(([key, a]) => finalizePattern(key, a, nowIso))
    .filter((p) => p.samples >= 2)
    .sort((a, b) => Math.abs(b.experience) - Math.abs(a.experience));

  const topPositive = patterns
    .filter((p) => p.polarity === "positive")
    .sort((a, b) => b.experience - a.experience)
    .slice(0, 10);
  const topNegative = patterns
    .filter((p) => p.polarity === "negative")
    .sort((a, b) => a.experience - b.experience)
    .slice(0, 10);

  const pos = topPositive.reduce((s, p) => s + p.experience, 0);
  const neg = Math.abs(topNegative.reduce((s, p) => s + p.experience, 0));
  const memoryScore = Math.round(
    Math.max(0, Math.min(100, 50 + (pos - neg) / 20))
  );

  const snapshot: AiMemorySnapshot = {
    version: 1,
    rebuiltAt: nowIso,
    lookbackDays: LOOKBACK_DAYS,
    stats: {
      published,
      rejected,
      liked,
      disliked,
      deleted,
      learnedLast30d,
      patternCount: patterns.length,
      memoryScore,
    },
    patterns: patterns.slice(0, 200),
    topPositive,
    topNegative,
  };

  await prisma.setting.upsert({
    where: { key: AI_MEMORY_SETTING_KEY },
    create: {
      key: AI_MEMORY_SETTING_KEY,
      value: snapshot as unknown as Prisma.InputJsonValue,
    },
    update: { value: snapshot as unknown as Prisma.InputJsonValue },
  });

  return snapshot;
}

function parseSnapshot(raw: unknown): AiMemorySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as AiMemorySnapshot;
  if (v.version !== 1 || !Array.isArray(v.patterns)) return null;
  return v;
}

/** Load cached memory; rebuild if missing/stale. */
export async function getAiMemory(opts?: {
  storeId?: string | null;
  forceRebuild?: boolean;
}): Promise<AiMemorySnapshot> {
  if (!opts?.forceRebuild) {
    const row = await prisma.setting.findUnique({
      where: { key: AI_MEMORY_SETTING_KEY },
    });
    const cached = parseSnapshot(row?.value);
    if (cached) {
      const age = Date.now() - new Date(cached.rebuiltAt).getTime();
      if (Number.isFinite(age) && age < STALE_MS) return cached;
    }
  }
  try {
    return await rebuildAiMemory({ storeId: opts?.storeId });
  } catch {
    return emptySnapshot();
  }
}

/**
 * Small additive score for a candidate. Never exceeds ±MEMORY_NUDGE_MAX.
 * Does not rewrite Merch Brain — caller may apply nudge to display score.
 */
export function scoreAiMemory(
  memory: AiMemorySnapshot,
  candidate: {
    title: string;
    supplier?: string | null;
    fingerprint?: string | null;
    categoryHint?: string | null;
  }
): AiMemoryNudge {
  const title = (candidate.title || "").trim();
  const familyId = matchFamily(title, candidate.categoryHint) || "unknown";
  const supplier = String(candidate.supplier || "").toLowerCase();
  const fp =
    (candidate.fingerprint && String(candidate.fingerprint)) ||
    productFingerprint(title);

  const keys = [
    `family:${familyId}`,
    supplier ? `supplier:${supplier}` : null,
    fp ? `fp:${fp.slice(0, 48)}` : null,
  ].filter(Boolean) as string[];

  const byKey = new Map(memory.patterns.map((p) => [p.key, p]));
  const matched: AiMemoryPattern[] = [];
  for (const k of keys) {
    const p = byKey.get(k);
    if (p) matched.push(p);
  }

  if (matched.length === 0) {
    return {
      nudge: 0,
      memoryScore: memory.stats.memoryScore,
      why: ["Ingen tidligere erfaring med dette mønsteret ennå"],
      matchedPatterns: [],
    };
  }

  // Weight supplier + fingerprint a bit higher than broad family
  let weighted = 0;
  let weightSum = 0;
  const why: string[] = [];
  for (const p of matched) {
    const w = p.kind === "fingerprint" ? 1.4 : p.kind === "supplier" ? 1.2 : 1;
    weighted += p.experience * w;
    weightSum += w;
    for (const line of p.why) {
      if (!why.includes(line)) why.push(line);
    }
  }
  const avgExp = weightSum > 0 ? weighted / weightSum : 0;
  // Map experience (−100..100) → nudge (−3..+3)
  const nudge = Math.max(
    -MEMORY_NUDGE_MAX,
    Math.min(MEMORY_NUDGE_MAX, Math.round((avgExp / 100) * MEMORY_NUDGE_MAX))
  );

  const memoryScore = Math.max(
    0,
    Math.min(100, Math.round(50 + avgExp / 2))
  );

  if (nudge > 0 && !why.some((w) => w.startsWith("✔") || w.includes("gode erfaringer"))) {
    why.unshift("✔ Positiv butikk-erfaring trekker litt opp");
  }
  if (nudge < 0 && !why.some((w) => w.includes("avviser"))) {
    why.unshift("⚠ Negativ butikk-erfaring trekker litt ned");
  }

  return {
    nudge,
    memoryScore,
    why: why.slice(0, 4),
    matchedPatterns: matched.map((p) => ({
      key: p.key,
      label: p.label,
      polarity: p.polarity,
    })),
  };
}

/**
 * Apply capped memory nudge to a Butikkscore without changing Merch Brain.
 */
export function applyAiMemoryNudge(
  butikkscore: number,
  nudge: AiMemoryNudge
): {
  butikkscore: number;
  memoryNudge: number;
  memoryScore: number;
  memoryWhy: string[];
} {
  const capped = Math.max(
    -MEMORY_NUDGE_MAX,
    Math.min(MEMORY_NUDGE_MAX, nudge.nudge)
  );
  return {
    butikkscore: Math.max(0, Math.min(100, Math.round(butikkscore + capped))),
    memoryNudge: capped,
    memoryScore: nudge.memoryScore,
    memoryWhy: nudge.why,
  };
}
