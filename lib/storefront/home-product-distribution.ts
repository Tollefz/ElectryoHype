/**
 * Homepage product distribution — disjoint, curated, premium-first sections.
 *
 * Rules:
 * - Frontpage exclusions (car booster / jump starter / …) never appear
 * - Max one product family + one image fingerprint per section
 * - Prefer premium score over filling every slot
 * - Section roles stay distinct (popular / deals / newest / category)
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  diversifyProducts,
  isFrontpageExcluded,
  premiumScore,
  withCuratedPrimaryImage,
  type CuratableProduct,
} from "@/lib/storefront/curation";

export type HomeProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  images: string;
  category: string | null;
  /** Curated primary image for cards / hero */
  imageUrl?: string | null;
};

export type HomeSectionId =
  | "hero"
  | "popular"
  | "deals"
  | "newest"
  | "mobil"
  | "gaming"
  | "data"
  | "tv"
  | "hjem";

export type HomeSections = {
  hero: HomeProduct[];
  popular: HomeProduct[];
  deals: HomeProduct[];
  newest: HomeProduct[];
  mobil: HomeProduct[];
  gaming: HomeProduct[];
  data: HomeProduct[];
  tv: HomeProduct[];
  hjem: HomeProduct[];
};

const EXCLUDE_CATEGORIES = ["Sport", "Klær", "Sport & Trening"] as const;

/** Prefer fewer, better products over padded rows. */
const SECTION_LIMITS: Record<HomeSectionId, number> = {
  hero: 4,
  popular: 5,
  deals: 5,
  newest: 5,
  mobil: 5,
  gaming: 5,
  data: 5,
  tv: 5,
  hjem: 5,
};

const CLAIM_ORDER: HomeSectionId[] = [
  "hero",
  "popular",
  "deals",
  "newest",
  "mobil",
  "gaming",
  "data",
  "tv",
  "hjem",
];

const CATEGORY_FILTER: Record<
  "gaming" | "mobil" | "tv" | "hjem" | "data",
  string
> = {
  gaming: "Gaming",
  mobil: "Mobil & Tilbehør",
  data: "Data & IT",
  tv: "TV, Lyd & Bilde",
  hjem: "Hjem & Fritid",
};

const baseSelect = {
  id: true,
  name: true,
  slug: true,
  price: true,
  compareAtPrice: true,
  images: true,
  category: true,
  subcategory: true,
  tags: true,
  qualityScore: true,
  profitMargin: true,
  createdAt: true,
  // Keep short text only — full description blobs dominate home query cost/TTFB.
  shortDescription: true,
  metaTitle: true,
  aiCategorySuggested: true,
  _count: { select: { orderItems: true } },
} satisfies Prisma.ProductSelect;

type RawRow = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  images: string;
  category: string | null;
  subcategory: string | null;
  tags: string;
  qualityScore: number | null;
  profitMargin: string | null;
  createdAt: Date;
  shortDescription: string | null;
  metaTitle: string | null;
  aiCategorySuggested: string | null;
  _count: { orderItems: number };
};

function toCuratable(p: RawRow): CuratableProduct {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: Number(p.price),
    compareAtPrice: p.compareAtPrice != null ? Number(p.compareAtPrice) : null,
    images: p.images,
    category: p.category,
    subcategory: p.subcategory,
    tags: p.tags,
    qualityScore: p.qualityScore,
    description: null,
    shortDescription: p.shortDescription,
    metaTitle: p.metaTitle,
    metaDescription: null,
    aiCategorySuggested: p.aiCategorySuggested,
    aiCategoryReason: null,
  };
}

function toHomeProduct(p: CuratableProduct): HomeProduct {
  const curated = withCuratedPrimaryImage(p);
  return {
    id: curated.id,
    name: curated.name,
    slug: curated.slug,
    price: curated.price,
    compareAtPrice: curated.compareAtPrice ?? null,
    images: curated.images,
    category: curated.category ?? null,
    imageUrl: curated.imageUrl,
  };
}

function baseWhere(storeId: string): Prisma.ProductWhereInput {
  return {
    isActive: true,
    storeId,
    category: { notIn: [...EXCLUDE_CATEGORIES] },
  };
}

function discountPct(p: CuratableProduct): number {
  if (p.compareAtPrice == null || p.compareAtPrice <= p.price) return 0;
  return ((p.compareAtPrice - p.price) / p.compareAtPrice) * 100;
}

function parseMarginPct(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

function filterPool(rows: RawRow[]): CuratableProduct[] {
  return rows
    .map(toCuratable)
    .filter((p) => !isFrontpageExcluded(p))
    .sort((a, b) => premiumScore(b) - premiumScore(a));
}

async function loadPopularPool(storeId: string, take: number): Promise<RawRow[]> {
  const where = baseWhere(storeId);
  const bySales = await prisma.product.findMany({
    where,
    orderBy: [
      { orderItems: { _count: "desc" } },
      { qualityScore: "desc" },
      { createdAt: "desc" },
    ],
    take: take * 2,
    select: baseSelect,
  });
  const sold = bySales.filter((p) => p._count.orderItems > 0);
  if (sold.length >= Math.min(10, take)) {
    return bySales as RawRow[];
  }
  const byQuality = await prisma.product.findMany({
    where,
    orderBy: [{ qualityScore: "desc" }, { createdAt: "desc" }],
    take: take * 2,
    select: baseSelect,
  });
  const seen = new Set(sold.map((p) => p.id));
  const merged = [...sold];
  for (const p of byQuality) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    merged.push(p as RawRow);
    if (merged.length >= take * 2) break;
  }
  return merged;
}

async function loadDealsPool(storeId: string, take: number): Promise<RawRow[]> {
  const rows = await prisma.product.findMany({
    where: {
      ...baseWhere(storeId),
      compareAtPrice: { not: null, gt: 0 },
    },
    orderBy: [{ createdAt: "desc" }],
    take: Math.max(take * 4, 80),
    select: baseSelect,
  });
  const mapped = (rows as RawRow[]).filter(
    (p) =>
      p.compareAtPrice != null &&
      Number(p.compareAtPrice) > Number(p.price) &&
      !isFrontpageExcluded(p)
  );
  mapped.sort((a, b) => {
    const ca = toCuratable(a);
    const cb = toCuratable(b);
    const da = discountPct(ca);
    const db = discountPct(cb);
    // Deals role: deepest real discount first, then premium feel
    if (Math.abs(db - da) > 2) return db - da;
    const pa = premiumScore(ca);
    const pb = premiumScore(cb);
    if (pb !== pa) return pb - pa;
    const ma = parseMarginPct(a.profitMargin) ?? 0;
    const mb = parseMarginPct(b.profitMargin) ?? 0;
    return mb - ma;
  });
  return mapped.slice(0, take * 2);
}

async function loadNewestPool(storeId: string, take: number): Promise<RawRow[]> {
  return prisma.product.findMany({
    where: baseWhere(storeId),
    orderBy: { createdAt: "desc" },
    take: take * 2,
    select: baseSelect,
  }) as Promise<RawRow[]>;
}

async function loadHeroPool(storeId: string, take: number): Promise<RawRow[]> {
  const rows = await prisma.product.findMany({
    where: baseWhere(storeId),
    orderBy: [{ qualityScore: "desc" }, { createdAt: "desc" }],
    take: Math.max(take * 8, 64),
    select: baseSelect,
  });
  return [...(rows as RawRow[])].sort(
    (a, b) => premiumScore(toCuratable(b)) - premiumScore(toCuratable(a))
  );
}

async function loadCategoryPool(
  storeId: string,
  key: keyof typeof CATEGORY_FILTER,
  take: number
): Promise<RawRow[]> {
  return prisma.product.findMany({
    where: {
      ...baseWhere(storeId),
      category: CATEGORY_FILTER[key],
    },
    orderBy: [{ qualityScore: "desc" }, { createdAt: "desc" }],
    take: take * 2,
    select: baseSelect,
  }) as Promise<RawRow[]>;
}

export type DistributionResult = {
  sections: HomeSections;
  usedIds: string[];
  debug: Record<HomeSectionId, string[]>;
};

/**
 * Build curated disjoint homepage sections.
 */
export async function distributeHomeProducts(
  storeId: string
): Promise<DistributionResult> {
  const poolSize = 48;
  const [
    heroRaw,
    popularRaw,
    dealsRaw,
    newestRaw,
    mobilRaw,
    gamingRaw,
    dataRaw,
    tvRaw,
    hjemRaw,
  ] = await Promise.all([
    loadHeroPool(storeId, poolSize),
    loadPopularPool(storeId, poolSize),
    loadDealsPool(storeId, poolSize),
    loadNewestPool(storeId, poolSize),
    loadCategoryPool(storeId, "mobil", poolSize),
    loadCategoryPool(storeId, "gaming", poolSize),
    loadCategoryPool(storeId, "data", poolSize),
    loadCategoryPool(storeId, "tv", poolSize),
    loadCategoryPool(storeId, "hjem", poolSize),
  ]);

  const pools: Record<HomeSectionId, CuratableProduct[]> = {
    hero: filterPool(heroRaw),
    popular: filterPool(popularRaw),
    deals: filterPool(dealsRaw),
    newest: filterPool(newestRaw),
    mobil: filterPool(mobilRaw),
    gaming: filterPool(gamingRaw),
    data: filterPool(dataRaw),
    tv: filterPool(tvRaw),
    hjem: filterPool(hjemRaw),
  };

  // Deals: keep discount-first order from loader (filterPool re-sorted by premium)
  pools.deals = dealsRaw
    .map(toCuratable)
    .filter((p) => !isFrontpageExcluded(p));

  // Newest: keep createdAt order, only soft premium filter later
  pools.newest = newestRaw
    .map(toCuratable)
    .filter((p) => !isFrontpageExcluded(p));

  const usedIds = new Set<string>();
  const sections = {} as HomeSections;
  const debug = {} as Record<HomeSectionId, string[]>;

  for (const id of CLAIM_ORDER) {
    const minPremium =
      id === "newest" ? 10 : id === "deals" ? 15 : id === "hero" ? 35 : 22;

    const claimed = diversifyProducts(pools[id], {
      limit: SECTION_LIMITS[id],
      usedIds,
      minPremiumScore: minPremium,
      allowFewer: true,
      preserveInputOrder: id === "newest" || id === "deals",
    });

    sections[id] = claimed.map(toHomeProduct);
    debug[id] = claimed.map((p) => p.id);
  }

  return {
    sections,
    usedIds: [...usedIds],
    debug,
  };
}

export function findDuplicateSectionIds(
  sections: HomeSections
): { id: string; sections: HomeSectionId[] }[] {
  const map = new Map<string, HomeSectionId[]>();
  for (const key of CLAIM_ORDER) {
    for (const p of sections[key]) {
      const list = map.get(p.id) || [];
      list.push(key);
      map.set(p.id, list);
    }
  }
  return [...map.entries()]
    .filter(([, secs]) => secs.length > 1)
    .map(([id, secs]) => ({ id, sections: secs }));
}

/** Kept for scripts that imported UsedProductSet */
export class UsedProductSet {
  private used = new Set<string>();
  has(id: string) {
    return this.used.has(id);
  }
  size() {
    return this.used.size;
  }
  ids() {
    return [...this.used];
  }
  claim(pool: HomeProduct[], limit: number): HomeProduct[] {
    const picked = diversifyProducts(
      pool.map((p) => ({
        ...p,
        tags: null,
        qualityScore: null,
      })),
      { limit, usedIds: this.used, allowFewer: true }
    );
    return picked.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      compareAtPrice: p.compareAtPrice ?? null,
      images: p.images,
      category: p.category ?? null,
    }));
  }
}

