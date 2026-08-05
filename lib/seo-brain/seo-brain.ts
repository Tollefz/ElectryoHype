/**
 * SEO Brain — audit catalog SEO (monitor only, never auto-generates content).
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { cleanProductName } from "@/lib/utils/url-decode";
import {
  aggregateSeoScore,
  scoreProductSeo,
  type SeoProductScoreResult,
} from "./seo-score";
import {
  buildSeoInsights,
  summarizeSeoAudit,
  type SeoAuditSummary,
  type SeoInsight,
} from "./seo-insights";
import { rebuildSeoMemory, type SeoMemorySnapshot } from "./seo-memory";

export type SeoBrainSnapshot = {
  generatedAt: string;
  storeId: string;
  seoScore: number;
  summary: SeoAuditSummary;
  insights: SeoInsight[];
  memory: SeoMemorySnapshot;
  worstPages: SeoProductScoreResult[];
  warnings: Array<{
    path: string;
    name: string;
    message: string;
    why: string;
  }>;
  opportunities: Array<{
    path: string;
    name: string;
    message: string;
    why: string;
  }>;
  /** Static / structural checks (not a live crawl) */
  structure: {
    sitemapLikely: boolean;
    robotsConfigured: boolean;
    canonicalPattern: string;
    schemaOnPdp: boolean;
    categorySeoNote: string;
    faqSitePage: boolean;
  };
};

export async function advanceSeoBrain(opts?: {
  storeId?: string;
  limit?: number;
}): Promise<SeoBrainSnapshot> {
  const storeId = opts?.storeId || DEFAULT_STORE_ID;
  const limit = opts?.limit ?? 400;

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [{ storeId }, { storeId: null }],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      metaTitle: true,
      metaDescription: true,
      description: true,
      shortDescription: true,
      images: true,
      category: true,
      price: true,
      isActive: true,
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  // Duplicate meta titles
  const titleMap = new Map<string, number>();
  for (const p of products) {
    const t = (p.metaTitle || "").trim().toLowerCase();
    if (!t) continue;
    titleMap.set(t, (titleMap.get(t) || 0) + 1);
  }

  const results = products.map((p) => {
    const t = (p.metaTitle || "").trim().toLowerCase();
    return scoreProductSeo({
      id: p.id,
      name: cleanProductName(p.name),
      slug: p.slug,
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      description: p.description,
      shortDescription: p.shortDescription,
      images: p.images,
      category: p.category,
      price: p.price,
      isActive: p.isActive,
      duplicateMetaTitle: Boolean(t && (titleMap.get(t) || 0) > 1),
    });
  });

  const summary = summarizeSeoAudit(results);
  const seoScore = aggregateSeoScore(results.map((r) => r.score));
  const insights = buildSeoInsights(results, summary);
  const memory = await rebuildSeoMemory(summary, storeId);

  const worstPages = [...results]
    .sort((a, b) => a.score - b.score)
    .slice(0, 10);

  const warnings: SeoBrainSnapshot["warnings"] = [];
  const opportunities: SeoBrainSnapshot["opportunities"] = [];
  for (const r of results) {
    for (const i of r.issues) {
      if (i.severity === "critical" || i.severity === "warning") {
        if (warnings.length < 20) {
          warnings.push({
            path: r.path,
            name: r.name,
            message: i.message,
            why: i.why,
          });
        }
      } else if (i.severity === "opportunity" && opportunities.length < 20) {
        opportunities.push({
          path: r.path,
          name: r.name,
          message: i.message,
          why: i.why,
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    storeId,
    seoScore,
    summary: { ...summary, avgScore: seoScore },
    insights,
    memory,
    worstPages,
    warnings,
    opportunities,
    structure: {
      sitemapLikely: true,
      robotsConfigured: true,
      canonicalPattern: "/products/[slug] via generateSEOMetadata",
      schemaOnPdp: true,
      categorySeoNote:
        "Kategori-SEO via /products?category=… — sider uten kategori mister intern linking",
      faqSitePage: true,
    },
  };
}
