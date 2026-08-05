/**
 * Produktfokus — persistence + control-center dashboard (server-only).
 */

import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PRODUCT_FAMILIES, familyLabel } from "@/lib/intelligence/families";
import {
  DEFAULT_FOCUS_STARS,
  DEFAULT_HUNT_STRATEGY,
  FOCUS_GROUP_DEFS,
  buildFocusGroups,
  clampFocusStars,
  computeGroupStars,
  familyTier,
  matchFamilyWithCustoms,
  primaryGroupForFamily,
  slugifyFocusLabel,
  type CustomFocusFamily,
  type FocusEntry,
  type FocusGroup,
  type FocusStars,
  type FocusSuggestion,
  type FocusTier,
} from "@/lib/buyer/product-focus-core";

export * from "@/lib/buyer/product-focus-core";

export const PRODUCT_FOCUS_KEY = "buyer_product_focus";
export const PRODUCT_FOCUS_STATS_KEY = "buyer_product_focus_stats";

export type ProductFocusConfig = {
  updatedAt: string;
  entries: FocusEntry[];
  customFamilies: CustomFocusFamily[];
  dismissedSuggestions: string[];
  /** Produktjakt-strategi — only affects hunt selection, not store rules */
  huntStrategy: string;
};

export type FocusGroupCard = {
  id: string;
  label: string;
  shortLabel: string;
  emoji: string;
  stars: FocusStars;
  activeFamilies: number;
  core: FocusGroup["items"];
  supplementary: FocusGroup["items"];
  stats: {
    scanned: number;
    approved: number;
    published: number;
    hitRatePct: number;
  };
  identityPct: number;
  timeSharePct: number;
};

export type FocusTimeShareRow = {
  groupId: string;
  label: string;
  emoji: string;
  pct: number;
};

export type FocusIdentityRow = {
  groupId: string;
  label: string;
  emoji: string;
  pct: number;
};

export type FocusProtest = {
  id: string;
  familyId: string;
  label: string;
  have: number;
  softMax: number;
  stars: FocusStars;
  message: string;
};

export type FocusRecommendation = {
  id: string;
  message: string;
  preferFamilies: Array<{ familyId: string; label: string }>;
};

export type ProductFocusDashboard = {
  updatedAt: string;
  groups: FocusGroupCard[];
  entries: FocusEntry[];
  starsByFamily: Record<string, FocusStars>;
  customFamilies: CustomFocusFamily[];
  suggestions: FocusSuggestion[];
  protests: FocusProtest[];
  recommendations: FocusRecommendation[];
  timeShare: FocusTimeShareRow[];
  identity: FocusIdentityRow[];
  activeCount: number;
  huntLive: boolean;
  huntStrategy: string;
};

export function defaultProductFocus(): ProductFocusConfig {
  const seen = new Set<string>();
  const entries: FocusEntry[] = [];
  for (const g of FOCUS_GROUP_DEFS) {
    for (const f of [...g.core, ...g.supplementary]) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      entries.push({
        familyId: f.id,
        stars: DEFAULT_FOCUS_STARS[f.id] ?? 0,
      });
    }
  }
  return {
    updatedAt: new Date().toISOString(),
    entries,
    customFamilies: [],
    dismissedSuggestions: [],
    huntStrategy: DEFAULT_HUNT_STRATEGY,
  };
}

function normalizeConfig(raw: unknown): ProductFocusConfig {
  const defaults = defaultProductFocus();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const o = raw as Record<string, unknown>;
  const byId = new Map(defaults.entries.map((e) => [e.familyId, e]));
  const entriesIn = Array.isArray(o.entries) ? o.entries : [];
  for (const row of entriesIn) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const familyId = String(r.familyId || "").trim();
    if (!familyId) continue;
    byId.set(familyId, { familyId, stars: clampFocusStars(r.stars) });
  }

  const customs: CustomFocusFamily[] = [];
  const customsIn = Array.isArray(o.customFamilies) ? o.customFamilies : [];
  for (const row of customsIn) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id =
      String(r.id || "").trim() ||
      slugifyFocusLabel(String(r.label || "custom"));
    const label = String(r.label || id).trim().slice(0, 80);
    const groupId = String(r.groupId || "maker").trim() || "maker";
    const keywords = Array.isArray(r.keywords)
      ? r.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 20)
      : [];
    const tier: FocusTier =
      r.tier === "core" ? "core" : "supplementary";
    if (!label) continue;
    customs.push({ id, label, groupId, keywords, tier });
    if (!byId.has(id)) {
      byId.set(id, { familyId: id, stars: clampFocusStars(r.stars) });
    }
  }

  const dismissed = Array.isArray(o.dismissedSuggestions)
    ? o.dismissedSuggestions.map(String).slice(0, 200)
    : [];

  const huntStrategy =
    typeof o.huntStrategy === "string" && o.huntStrategy.trim()
      ? o.huntStrategy.slice(0, 8000)
      : DEFAULT_HUNT_STRATEGY;

  return {
    updatedAt:
      typeof o.updatedAt === "string" ? o.updatedAt : defaults.updatedAt,
    entries: [...byId.values()],
    customFamilies: customs,
    dismissedSuggestions: dismissed,
    huntStrategy,
  };
}

export async function getProductFocus(): Promise<ProductFocusConfig> {
  const row = await prisma.setting.findUnique({
    where: { key: PRODUCT_FOCUS_KEY },
  });
  return normalizeConfig(row?.value);
}

export async function saveProductFocus(partial: {
  entries?: FocusEntry[];
  customFamilies?: CustomFocusFamily[];
  dismissedSuggestions?: string[];
  huntStrategy?: string;
  addCustom?: {
    label: string;
    groupId?: string;
    keywords?: string[];
    stars?: FocusStars;
    tier?: FocusTier;
  };
  dismissSuggestion?: string;
  acceptSuggestion?: string;
  /** Accept protest / reduce-focus suggestion */
  reduceFocus?: { familyId: string; stars?: FocusStars };
}): Promise<ProductFocusConfig> {
  const current = await getProductFocus();
  let entries = current.entries;
  let customs = current.customFamilies;
  let dismissed = current.dismissedSuggestions;
  let huntStrategy = current.huntStrategy;

  if (partial.entries) {
    const map = new Map(entries.map((e) => [e.familyId, e]));
    for (const e of partial.entries) {
      map.set(e.familyId, {
        familyId: e.familyId,
        stars: clampFocusStars(e.stars),
      });
    }
    entries = [...map.values()];
  }

  if (partial.customFamilies) customs = partial.customFamilies;

  if (partial.addCustom) {
    const label = partial.addCustom.label.trim().slice(0, 80);
    if (label) {
      let id = slugifyFocusLabel(label);
      const existingIds = new Set([
        ...PRODUCT_FAMILIES.map((f) => f.id),
        ...customs.map((c) => c.id),
      ]);
      if (existingIds.has(id)) {
        id = `${id}_${Date.now().toString(36).slice(-4)}`;
      }
      const keywords =
        partial.addCustom.keywords?.filter(Boolean).slice(0, 20) || [label];
      customs = [
        ...customs,
        {
          id,
          label,
          groupId: partial.addCustom.groupId || "maker",
          keywords,
          tier: partial.addCustom.tier || "supplementary",
        },
      ];
      entries = [
        ...entries.filter((e) => e.familyId !== id),
        {
          familyId: id,
          stars: clampFocusStars(partial.addCustom.stars ?? 3),
        },
      ];
    }
  }

  if (partial.dismissSuggestion) {
    dismissed = [
      ...new Set([...dismissed, partial.dismissSuggestion]),
    ].slice(0, 200);
  }

  if (partial.acceptSuggestion) {
    const fid = partial.acceptSuggestion;
    const map = new Map(entries.map((e) => [e.familyId, e]));
    const cur = map.get(fid);
    map.set(fid, {
      familyId: fid,
      stars: cur && cur.stars > 0 ? Math.min(5, cur.stars + 1) as FocusStars : 3,
    });
    entries = [...map.values()];
    dismissed = dismissed.filter((d) => d !== fid && d !== `reduce:${fid}`);
  }

  if (partial.reduceFocus) {
    const fid = partial.reduceFocus.familyId;
    const map = new Map(entries.map((e) => [e.familyId, e]));
    const cur = map.get(fid);
    const next =
      partial.reduceFocus.stars != null
        ? clampFocusStars(partial.reduceFocus.stars)
        : clampFocusStars(Math.max(0, (cur?.stars ?? 0) - 2));
    map.set(fid, { familyId: fid, stars: next });
    entries = [...map.values()];
    dismissed = [
      ...new Set([...dismissed, `reduce:${fid}`, `protest:${fid}`]),
    ].slice(0, 200);
  }

  if (partial.dismissedSuggestions) {
    dismissed = partial.dismissedSuggestions;
  }

  if (typeof partial.huntStrategy === "string") {
    huntStrategy = partial.huntStrategy.trim()
      ? partial.huntStrategy.slice(0, 8000)
      : DEFAULT_HUNT_STRATEGY;
  }

  const merged = normalizeConfig({
    updatedAt: new Date().toISOString(),
    entries,
    customFamilies: customs,
    dismissedSuggestions: dismissed,
    huntStrategy,
  });

  await prisma.setting.upsert({
    where: { key: PRODUCT_FOCUS_KEY },
    create: {
      key: PRODUCT_FOCUS_KEY,
      value: merged as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: merged as unknown as Prisma.InputJsonValue,
    },
  });
  return merged;
}

export function starsMap(
  config: ProductFocusConfig
): Record<string, FocusStars> {
  const out: Record<string, FocusStars> = {};
  for (const e of config.entries) out[e.familyId] = e.stars;
  return out;
}

type ActivityStats = {
  publishedByFamily: Record<string, number>;
  ignoredByFamily: Record<string, number>;
  updatedAt: string;
};

async function getActivityStats(): Promise<ActivityStats> {
  const row = await prisma.setting.findUnique({
    where: { key: PRODUCT_FOCUS_STATS_KEY },
  });
  const raw = row?.value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      publishedByFamily: {},
      ignoredByFamily: {},
      updatedAt: new Date().toISOString(),
    };
  }
  const o = raw as Record<string, unknown>;
  // Legacy: byFamily → publishedByFamily
  const published =
    o.publishedByFamily &&
    typeof o.publishedByFamily === "object" &&
    !Array.isArray(o.publishedByFamily)
      ? (o.publishedByFamily as Record<string, number>)
      : o.byFamily && typeof o.byFamily === "object" && !Array.isArray(o.byFamily)
        ? (o.byFamily as Record<string, number>)
        : {};
  const ignored =
    o.ignoredByFamily &&
    typeof o.ignoredByFamily === "object" &&
    !Array.isArray(o.ignoredByFamily)
      ? (o.ignoredByFamily as Record<string, number>)
      : {};
  return {
    publishedByFamily: published,
    ignoredByFamily: ignored,
    updatedAt:
      typeof o.updatedAt === "string"
        ? o.updatedAt
        : new Date().toISOString(),
  };
}

async function saveActivityStats(stats: ActivityStats): Promise<void> {
  await prisma.setting.upsert({
    where: { key: PRODUCT_FOCUS_STATS_KEY },
    create: {
      key: PRODUCT_FOCUS_STATS_KEY,
      value: stats as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: stats as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function recordFocusPublishes(
  titles: string[],
  customs?: CustomFocusFamily[]
): Promise<void> {
  if (!titles.length) return;
  const config = customs ? null : await getProductFocus();
  const customList = customs ?? config!.customFamilies;
  const stats = await getActivityStats();
  for (const title of titles) {
    const fid = matchFamilyWithCustoms(title, null, customList);
    if (!fid) continue;
    stats.publishedByFamily[fid] = (stats.publishedByFamily[fid] || 0) + 1;
  }
  stats.updatedAt = new Date().toISOString();
  await saveActivityStats(stats);
}

export async function recordFocusIgnores(
  titles: string[],
  customs?: CustomFocusFamily[]
): Promise<void> {
  if (!titles.length) return;
  const config = customs ? null : await getProductFocus();
  const customList = customs ?? config!.customFamilies;
  const stats = await getActivityStats();
  for (const title of titles) {
    const fid = matchFamilyWithCustoms(title, null, customList);
    if (!fid) continue;
    stats.ignoredByFamily[fid] = (stats.ignoredByFamily[fid] || 0) + 1;
  }
  stats.updatedAt = new Date().toISOString();
  await saveActivityStats(stats);
}

function labelForFamily(
  familyId: string,
  config: ProductFocusConfig
): string {
  const custom = config.customFamilies.find((c) => c.id === familyId);
  if (custom) return custom.label;
  for (const g of FOCUS_GROUP_DEFS) {
    const hit = [...g.core, ...g.supplementary].find((f) => f.id === familyId);
    if (hit) return hit.label;
  }
  return familyLabel(familyId) || familyId;
}

function familyIdsForGroup(
  groupId: string,
  customs: CustomFocusFamily[]
): Set<string> {
  const set = new Set<string>();
  const g = FOCUS_GROUP_DEFS.find((x) => x.id === groupId);
  if (g) {
    for (const f of [...g.core, ...g.supplementary]) set.add(f.id);
  }
  for (const c of customs) {
    if (c.groupId === groupId) set.add(c.id);
  }
  return set;
}

export async function getFocusSuggestions(
  config?: ProductFocusConfig
): Promise<FocusSuggestion[]> {
  const cfg = config ?? (await getProductFocus());
  const stats = await getActivityStats();
  const stars = starsMap(cfg);
  const out: FocusSuggestion[] = [];

  for (const [familyId, count] of Object.entries(stats.publishedByFamily)) {
    if (cfg.dismissedSuggestions.includes(familyId)) continue;
    const cur = stars[familyId] ?? 0;
    const label = labelForFamily(familyId, cfg);
    if (count >= 8 && cur === 0) {
      out.push({
        id: `add:${familyId}`,
        kind: "add_focus",
        familyId,
        groupId: primaryGroupForFamily(familyId, cfg.customFamilies)?.id || null,
        label,
        publishCount: count,
        message: `Du publiserer ofte ${label} (${count} stk). Vil du legge den til Produktfokus?`,
        proposedStars: 3,
      });
    } else if (count >= 12 && cur > 0 && cur < 5) {
      if (cfg.dismissedSuggestions.includes(`increase:${familyId}`)) continue;
      out.push({
        id: `increase:${familyId}`,
        kind: "increase_focus",
        familyId,
        groupId: primaryGroupForFamily(familyId, cfg.customFamilies)?.id || null,
        label,
        publishCount: count,
        message: `Du publiserer mange ${label}. Vil du øke fokus?`,
        proposedStars: clampFocusStars(cur + 1),
      });
    }
  }

  for (const [familyId, count] of Object.entries(stats.ignoredByFamily)) {
    if (count < 40) continue;
    const cur = stars[familyId] ?? 0;
    if (cur <= 0) continue;
    if (cfg.dismissedSuggestions.includes(`reduce:${familyId}`)) continue;
    const label = labelForFamily(familyId, cfg);
    out.push({
      id: `reduce:${familyId}`,
      kind: "reduce_focus",
      familyId,
      groupId: primaryGroupForFamily(familyId, cfg.customFamilies)?.id || null,
      label,
      ignoreCount: count,
      message: `Du har ignorert ${count} ${label}. Vil du redusere fokus?`,
      proposedStars: clampFocusStars(Math.max(0, cur - 2)),
    });
  }

  return out.slice(0, 8);
}

async function loadHuntGroupCounts(
  customs: CustomFocusFamily[]
): Promise<{
  scanned: Record<string, number>;
  approved: Record<string, number>;
  huntLive: boolean;
}> {
  const scanned: Record<string, number> = {};
  const approved: Record<string, number> = {};
  let huntLive = false;

  try {
    const latest = await prisma.buyerScanRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { id: true, status: true },
    });
    if (!latest) return { scanned, approved, huntLive: false };
    huntLive =
      latest.status === "running" ||
      latest.status === "queued" ||
      latest.status === "paused";

    const rows = await prisma.buyerCandidate.findMany({
      where: { scanRunId: latest.id },
      select: { title: true, status: true, snapshot: true },
      take: 5000,
    });

    for (const row of rows) {
      const snap =
        row.snapshot && typeof row.snapshot === "object"
          ? (row.snapshot as Record<string, unknown>)
          : {};
      const cat =
        typeof snap.categoryHint === "string"
          ? snap.categoryHint
          : typeof snap.category === "string"
            ? snap.category
            : null;
      const fid = matchFamilyWithCustoms(row.title || "", cat, customs);
      if (!fid) continue;
      const g = primaryGroupForFamily(fid, customs);
      if (!g) continue;
      scanned[g.id] = (scanned[g.id] || 0) + 1;
      if (row.status === "ranked" || row.status === "imported") {
        approved[g.id] = (approved[g.id] || 0) + 1;
      }
    }
  } catch {
    /* optional */
  }

  return { scanned, approved, huntLive };
}

export async function getProductFocusDashboard(): Promise<ProductFocusDashboard> {
  const config = await getProductFocus();
  const starsByFamily = starsMap(config);
  const built = buildFocusGroups(config.customFamilies);
  const [suggestions, activity, hunt, assortment] = await Promise.all([
    getFocusSuggestions(config),
    getActivityStats(),
    loadHuntGroupCounts(config.customFamilies),
    import("@/lib/buyer/assortment-strategy")
      .then(async (m) => {
        const [strategy, snapshot] = await Promise.all([
          m.getAssortmentStrategy(),
          m.loadCatalogSnapshotForStore(),
        ]);
        return { strategy, snapshot, boundsMap: m.boundsMap };
      })
      .catch(() => null),
  ]);

  const totalScanned = Object.values(hunt.scanned).reduce((a, b) => a + b, 0) || 1;

  const protests: FocusProtest[] = [];
  const recommendations: FocusRecommendation[] = [];

  const groupCards: FocusGroupCard[] = built.map((g) => {
    const activeFamilies = g.items.filter(
      (i) => (starsByFamily[i.familyId] ?? 0) > 0
    ).length;
    const stars = computeGroupStars(g, starsByFamily);
    const scanned = hunt.scanned[g.id] || 0;
    const approved = hunt.approved[g.id] || 0;
    const published = g.items.reduce(
      (s, i) => s + (activity.publishedByFamily[i.familyId] || 0),
      0
    );
    const hitRatePct =
      scanned > 0 ? Math.round((approved / scanned) * 100) : 0;
    const timeSharePct = Math.round((scanned / totalScanned) * 100);

    // Identity: blend focus stars + assortment fill for group families
    let identityHave = 0;
    let identityTarget = 0;
    if (assortment) {
      const bounds = assortment.boundsMap(
        assortment.strategy,
        assortment.snapshot.totalActive
      );
      for (const item of g.items) {
        const b = bounds[item.familyId];
        if (!b) continue;
        identityHave += assortment.snapshot.byFamily[item.familyId] || 0;
        identityTarget += b.target;
        const have = assortment.snapshot.byFamily[item.familyId] || 0;
        const soft = b.softMax;
        const famStars = starsByFamily[item.familyId] ?? 0;
        if (
          famStars >= 3 &&
          soft > 0 &&
          have >= soft &&
          !config.dismissedSuggestions.includes(`protest:${item.familyId}`)
        ) {
          protests.push({
            id: `protest:${item.familyId}`,
            familyId: item.familyId,
            label: item.label,
            have,
            softMax: soft,
            stars: famStars,
            message: `Vi har nå ${have} ${item.label.toLowerCase()}. Sortimentet er godt dekket. Jeg anbefaler å redusere fokus.`,
          });
        }
      }
    }

    const fillPct =
      identityTarget > 0
        ? Math.min(100, Math.round((identityHave / identityTarget) * 100))
        : stars * 18;
    const identityPct = Math.round(
      Math.min(100, fillPct * 0.55 + stars * 9 + Math.min(25, published))
    );

    return {
      id: g.id,
      label: g.label,
      shortLabel: g.shortLabel,
      emoji: g.emoji,
      stars,
      activeFamilies,
      core: g.items.filter((i) => i.tier === "core"),
      supplementary: g.items.filter((i) => i.tier === "supplementary"),
      stats: { scanned, approved, published, hitRatePct },
      identityPct,
      timeSharePct,
    };
  });

  // Recommendations: overfilled cores → suggest underfilled high-priority
  if (assortment) {
    const bounds = assortment.boundsMap(
      assortment.strategy,
      assortment.snapshot.totalActive
    );
    const saturated: string[] = [];
    const gaps: Array<{ familyId: string; label: string; gap: number; stars: number }> =
      [];
    for (const g of built) {
      for (const item of g.items) {
        if (item.tier !== "core") continue;
        const b = bounds[item.familyId];
        if (!b) continue;
        const have = assortment.snapshot.byFamily[item.familyId] || 0;
        const s = starsByFamily[item.familyId] ?? 0;
        if (s >= 4 && have >= b.target * 0.9) {
          saturated.push(item.label);
        }
        if (s >= 3 && have < b.target * 0.5) {
          gaps.push({
            familyId: item.familyId,
            label: item.label,
            gap: b.target - have,
            stars: s,
          });
        }
      }
    }
    gaps.sort((a, b) => b.gap - a.gap || b.stars - a.stars);
    if (saturated.length && gaps.length) {
      recommendations.push({
        id: "shift_saturated",
        message: `${saturated.slice(0, 2).join(" og ")} begynner å bli godt dekket. Prioriter heller:`,
        preferFamilies: gaps.slice(0, 6).map((x) => ({
          familyId: x.familyId,
          label: x.label,
        })),
      });
    } else if (gaps.length >= 3) {
      recommendations.push({
        id: "fill_gaps",
        message: "Underdekket kjerne — AI anbefaler mer tid på:",
        preferFamilies: gaps.slice(0, 6).map((x) => ({
          familyId: x.familyId,
          label: x.label,
        })),
      });
    }
  }

  const timeShare: FocusTimeShareRow[] = groupCards
    .filter((g) => g.timeSharePct > 0 || g.stars > 0)
    .map((g) => ({
      groupId: g.id,
      label: g.shortLabel,
      emoji: g.emoji,
      pct: g.timeSharePct,
    }))
    .sort((a, b) => b.pct - a.pct);

  // If hunt hasn't produced data yet, show planned share from focus stars
  if (timeShare.every((t) => t.pct === 0)) {
    const weightSum =
      groupCards.reduce((s, g) => s + g.stars * Math.max(1, g.activeFamilies), 0) ||
      1;
    for (const g of groupCards) {
      g.timeSharePct = Math.round(
        ((g.stars * Math.max(1, g.activeFamilies)) / weightSum) * 100
      );
    }
    timeShare.length = 0;
    timeShare.push(
      ...groupCards
        .filter((g) => g.timeSharePct > 0)
        .map((g) => ({
          groupId: g.id,
          label: g.shortLabel,
          emoji: g.emoji,
          pct: g.timeSharePct,
        }))
        .sort((a, b) => b.pct - a.pct)
    );
  }

  const identity: FocusIdentityRow[] = [...groupCards]
    .map((g) => ({
      groupId: g.id,
      label: g.shortLabel,
      emoji: g.emoji,
      pct: g.identityPct,
    }))
    .sort((a, b) => b.pct - a.pct);

  void familyIdsForGroup;
  void familyTier;

  return {
    updatedAt: config.updatedAt,
    groups: groupCards,
    entries: config.entries,
    starsByFamily,
    customFamilies: config.customFamilies,
    suggestions,
    protests: protests.slice(0, 5),
    recommendations: recommendations.slice(0, 3),
    timeShare: timeShare.slice(0, 8),
    identity,
    activeCount: config.entries.filter((e) => e.stars > 0).length,
    huntLive: hunt.huntLive,
    huntStrategy: config.huntStrategy || DEFAULT_HUNT_STRATEGY,
  };
}
