/**
 * Build StoreIdentityContext from Store Profile, DNA, Memory, Focus, catalog.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getOrCreateShopProfile } from "@/lib/suppliers/merchandiser/shop-profile";
import { getStoreDna } from "@/lib/buyer/store-dna";
import { getAiMemory } from "@/lib/buyer/ai-memory";
import { getProductFocus, starsMap } from "@/lib/buyer/product-focus";
import { matchFamily } from "@/lib/intelligence/families";
import { tokenizeIdentity } from "./tokens";
import type { StoreIdentityContext } from "./types";

const CONTEXT_CACHE_MS = 90_000;
let cache: { at: number; storeId: string; ctx: StoreIdentityContext } | null =
  null;

function uniqTokens(parts: string[]): string[] {
  const s = new Set<string>();
  for (const p of parts) {
    for (const t of tokenizeIdentity(p)) s.add(t);
  }
  return [...s];
}

/**
 * Load identity context for scoring. Cached briefly — safe for hunt batches.
 */
export async function getStoreIdentityContext(
  storeId: string | null = DEFAULT_STORE_ID
): Promise<StoreIdentityContext> {
  const sid = storeId || DEFAULT_STORE_ID;
  if (
    cache &&
    cache.storeId === sid &&
    Date.now() - cache.at < CONTEXT_CACHE_MS
  ) {
    return cache.ctx;
  }

  const [profile, dna, memory, focus, products, living] = await Promise.all([
    getOrCreateShopProfile(sid),
    getStoreDna().catch(() => null),
    getAiMemory().catch(() => null),
    getProductFocus().catch(() => null),
    prisma.product.findMany({
      where: {
        isActive: true,
        OR: [{ storeId: sid }, { storeId: null }],
      },
      select: {
        name: true,
        category: true,
        subcategory: true,
        tags: true,
      },
      take: 800,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.storeLivingProfile
      .findFirst({
        where: { OR: [{ storeId: sid }, { storeId: null }] },
        select: { categoryFocus: true, identitySummary: true },
      })
      .catch(() => null),
  ]);

  const catalogFamilyCount: Record<string, number> = {};
  for (const p of products) {
    const fam = matchFamily(p.name, p.category || undefined);
    if (!fam) continue;
    catalogFamilyCount[fam] = (catalogFamilyCount[fam] || 0) + 1;
  }
  const catalogProductCount = products.length;
  const catalogFamilyShare: Record<string, number> = {};
  for (const [fam, n] of Object.entries(catalogFamilyCount)) {
    catalogFamilyShare[fam] =
      catalogProductCount > 0
        ? Math.round((n / catalogProductCount) * 1000) / 10
        : 0;
  }

  const focusStarsByFamily: Record<string, number> = focus
    ? Object.fromEntries(
        Object.entries(starsMap(focus)).map(([k, v]) => [k, Number(v) || 0])
      )
    : {};

  const memoryFamilyExperience: Record<string, number> = {};
  const memoryRejectFamilies: string[] = [];
  for (const p of memory?.patterns || []) {
    if (p.kind !== "family") continue;
    const key = p.key.replace(/^family:/, "");
    memoryFamilyExperience[key] = p.experience;
    if (p.polarity === "negative" && p.rejected >= 2) {
      memoryRejectFamilies.push(key);
    }
  }

  let livingCategories: StoreIdentityContext["livingCategories"] = [];
  const rawFocus = living?.categoryFocus;
  if (Array.isArray(rawFocus)) {
    livingCategories = rawFocus
      .map((row) => {
        const o = row as { category?: string; share?: number };
        return {
          category: String(o.category || ""),
          share: Number(o.share) || 0,
        };
      })
      .filter((r) => r.category);
  }

  const identityTokens = uniqTokens([
    ...profile.categories,
    profile.productStrategy,
    profile.audience,
    profile.name,
    ...(living?.identitySummary ? [String(living.identitySummary)] : []),
    ...livingCategories.map((c) => c.category),
    ...(dna?.traits || [])
      .filter((t) => t.pct >= 10)
      .flatMap((t) => [t.id, t.label]),
  ].filter((x): x is string => Boolean(x)));

  const avoidTokens = uniqTokens(profile.avoidCategories || []);

  const ctx: StoreIdentityContext = {
    version: 1,
    storeId: sid,
    storeName: profile.name || "Butikken",
    rebuiltAt: new Date().toISOString(),
    profileCategories: profile.categories || [],
    avoidCategories: profile.avoidCategories || [],
    audience: profile.audience || "",
    productStrategy: profile.productStrategy || "",
    identityTokens,
    avoidTokens,
    focusStarsByFamily,
    catalogFamilyShare,
    catalogFamilyCount,
    catalogProductCount,
    dnaTraits: (dna?.traits || []).map((t) => ({
      id: t.id,
      label: t.label,
      pct: t.pct,
    })),
    livingCategories,
    memoryFamilyExperience,
    memoryRejectFamilies,
  };

  cache = { at: Date.now(), storeId: sid, ctx };
  return ctx;
}

export function invalidateStoreIdentityContextCache(): void {
  cache = null;
}
