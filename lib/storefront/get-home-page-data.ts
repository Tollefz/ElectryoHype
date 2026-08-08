/**
 * Homepage data — Result architecture + circuit breaker.
 * Product sections are disjoint via home-product-distribution.
 */

import { unstable_cache } from "next/cache";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getCategoriesWithCounts } from "@/lib/utils/product-count";
import { isDatabaseConfigured, isDevelopment } from "@/lib/utils/database-check";
import { withDatabaseCircuit } from "@/lib/ops/db-circuit";
import { ok, type Result } from "@/lib/result";
import {
  distributeHomeProducts,
  type HomeProduct,
  type HomeSections,
} from "@/lib/storefront/home-product-distribution";

export type { HomeProduct, HomeSections };

export type HomeCategory = {
  name: string;
  slug: string;
  count: number;
};

export type HomePageData = {
  /** @deprecated Prefer `sections` — kept empty for soft compat */
  products: HomeProduct[];
  /** @deprecated Prefer `sections.deals` */
  featuredProducts: HomeProduct[];
  sections: HomeSections;
  categories: HomeCategory[];
  /** Dev-only: DB env missing */
  dbNotConfigured: boolean;
};

function emptySections(): HomeSections {
  return {
    hero: [],
    popular: [],
    deals: [],
    newest: [],
    mobil: [],
    gaming: [],
    data: [],
    tv: [],
    hjem: [],
  };
}

async function loadForStore(storeId: string): Promise<HomePageData> {
  const [distributed, categoriesWithCounts] = await Promise.all([
    distributeHomeProducts(storeId),
    getCategoriesWithCounts(storeId),
  ]);

  const categories = categoriesWithCounts.slice(0, 6).map((cat) => ({
    name: cat.name,
    slug: cat.slug,
    count: cat.count,
  }));

  return {
    products: distributed.sections.newest,
    featuredProducts: distributed.sections.deals,
    sections: distributed.sections,
    categories,
    dbNotConfigured: false,
  };
}

/**
 * Single choke point for homepage DB I/O.
 * Data cache (60s) so warm requests skip heavy Prisma distribution work.
 */
async function getHomePageDataUncached(
  primaryStoreId: string
): Promise<Result<HomePageData>> {
  if (isDevelopment() && !isDatabaseConfigured()) {
    return ok({
      products: [],
      featuredProducts: [],
      sections: emptySections(),
      categories: [],
      dbNotConfigured: true,
    });
  }

  const storeId =
    primaryStoreId !== "demo-store" ? primaryStoreId : DEFAULT_STORE_ID;

  const primary = await withDatabaseCircuit("home:primary", () =>
    loadForStore(storeId)
  );

  if (!primary.ok) return primary;

  const hasAny =
    primary.data.sections.popular.length > 0 ||
    primary.data.sections.newest.length > 0 ||
    primary.data.sections.deals.length > 0;

  if (!hasAny && storeId !== DEFAULT_STORE_ID) {
    const fallback = await withDatabaseCircuit("home:fallback", () =>
      loadForStore(DEFAULT_STORE_ID)
    );
    if (fallback.ok) {
      const fbHas =
        fallback.data.sections.popular.length > 0 ||
        fallback.data.sections.newest.length > 0;
      if (fbHas) return fallback;
    }
  }

  return primary;
}

export async function getHomePageData(
  primaryStoreId: string
): Promise<Result<HomePageData>> {
  const storeId =
    primaryStoreId !== "demo-store" ? primaryStoreId : DEFAULT_STORE_ID;

  return unstable_cache(
    () => getHomePageDataUncached(storeId),
    ["home-page-data", storeId],
    { revalidate: 60, tags: ["home", `home:${storeId}`] }
  )();
}
