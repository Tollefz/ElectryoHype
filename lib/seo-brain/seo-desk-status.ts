/**
 * SEO Brain — Rob's Desk snapshot.
 * Monitor only — never auto-generates content.
 */

import "server-only";

import { DEFAULT_STORE_ID } from "@/lib/store";
import { advanceSeoBrain, type SeoBrainSnapshot } from "./seo-brain";

export type SeoDeskStatus = {
  status: "learning" | "ready" | "waiting" | "error";
  narrative: string;
  seoScore: number;
  memoryScore: number;
  rebuiltAt: string;
  summary: SeoBrainSnapshot["summary"];
  structure: SeoBrainSnapshot["structure"];
  insights: SeoBrainSnapshot["insights"];
  worstPages: Array<{
    name: string;
    path: string;
    score: number;
    why: string;
  }>;
  warnings: SeoBrainSnapshot["warnings"];
  opportunities: SeoBrainSnapshot["opportunities"];
  memoryStories: SeoBrainSnapshot["memory"]["stories"];
  errors: string[];
};

export async function getSeoDeskStatus(
  storeId = DEFAULT_STORE_ID
): Promise<SeoDeskStatus> {
  const errors: string[] = [];
  try {
    const brain = await advanceSeoBrain({ storeId });
    let status: SeoDeskStatus["status"] = "waiting";
    if (brain.summary.productCount > 0) {
      status =
        brain.summary.criticalCount > 0 || brain.seoScore < 60
          ? "learning"
          : "ready";
    }

    const narrative =
      brain.summary.productCount === 0
        ? "Jeg venter på aktive produkter. Når katalogen finnes, forklarer jeg hvorfor sider bør forbedres — uten å skrive innhold automatisk."
        : `SEO Score ${brain.seoScore}/100. ${brain.summary.criticalCount} kritiske · ${brain.summary.warningCount} advarsler · ${brain.summary.opportunityCount} muligheter.`;

    return {
      status,
      narrative,
      seoScore: brain.seoScore,
      memoryScore: brain.memory.stats.memoryScore,
      rebuiltAt: brain.generatedAt,
      summary: brain.summary,
      structure: brain.structure,
      insights: brain.insights.slice(0, 12),
      worstPages: brain.worstPages.slice(0, 8).map((p) => ({
        name: p.name,
        path: p.path,
        score: p.score,
        why: p.issues[0]?.why || p.issues[0]?.message || "Flere SEO-mangler",
      })),
      warnings: brain.warnings.slice(0, 10),
      opportunities: brain.opportunities.slice(0, 10),
      memoryStories: brain.memory.stories.slice(0, 6),
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    return {
      status: "error",
      narrative: "SEO Brain kunne ikke lese katalogdata.",
      seoScore: 0,
      memoryScore: 0,
      rebuiltAt: new Date().toISOString(),
      summary: {
        productCount: 0,
        avgScore: 0,
        indexingLikely: 0,
        indexingUnlikely: 0,
        warningCount: 0,
        opportunityCount: 0,
        criticalCount: 0,
        missingMeta: 0,
        duplicates: 0,
        missingFaq: 0,
        missingAlt: 0,
        missingCategory: 0,
      },
      structure: {
        sitemapLikely: true,
        robotsConfigured: true,
        canonicalPattern: "/products/[slug]",
        schemaOnPdp: true,
        categorySeoNote: "",
        faqSitePage: true,
      },
      insights: [],
      worstPages: [],
      warnings: [],
      opportunities: [],
      memoryStories: [],
      errors,
    };
  }
}
