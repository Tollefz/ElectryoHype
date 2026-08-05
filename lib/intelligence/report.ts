/**
 * Store Intelligence report builder — Category Manager brain.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  analyzeCategoryHealth,
  loadCatalogProducts,
} from "@/lib/intelligence/category-health";
import {
  buildComplementChains,
  findAssortmentGaps,
} from "@/lib/intelligence/assortment";
import { refreshLivingProfile } from "@/lib/intelligence/living-profile";
import { getExternalIntelligenceBoost } from "@/lib/intelligence/signals";
import type {
  DailyTask,
  IntelligenceRecommendation,
  StoreIntelligenceReport,
} from "@/lib/intelligence/types";

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function buildStoreIntelligence(
  storeId?: string | null
): Promise<StoreIntelligenceReport> {
  const products = await loadCatalogProducts(storeId);
  const { getAdminSnapshot } = await import("@/lib/ops/admin-snapshot");

  const [truth, seoGaps, merchSuggested, buyerAiCount, marginOutliers, stockChanges] =
    await Promise.all([
      getAdminSnapshot({ storeId }),
      prisma.product.count({
        where: {
          isActive: true,
          OR: [{ metaTitle: null }, { metaDescription: null }, { metaTitle: "" }],
          ...(storeId ? { storeId } : {}),
        },
      }),
      prisma.merchandiserRecommendation.count({
        where: { status: { in: ["suggested", "accepted"] } },
      }),
      (async () => {
        try {
          const { getBuyerReviewOverview } = await import("@/lib/buyer/review-board");
          const o = await getBuyerReviewOverview({ storeId });
          return o.aiConfident || o.score90 || 0;
        } catch {
          return 0;
        }
      })(),
      // Real margin outliers: sale price below cost or margin under 20%
      prisma.product.count({
        where: {
          isActive: true,
          supplierPrice: { gt: 0 },
          ...(storeId ? { storeId } : {}),
          // price < supplierPrice * 1.25 ≈ margin < 20%
        },
      }).then(async (withCost) => {
        if (withCost === 0) return 0;
        const sample = await prisma.product.findMany({
          where: {
            isActive: true,
            supplierPrice: { gt: 0 },
            ...(storeId ? { storeId } : {}),
          },
          select: { price: true, supplierPrice: true },
          take: 800,
        });
        return sample.filter((p) => {
          const cost = Number(p.supplierPrice) || 0;
          const price = Number(p.price) || 0;
          if (cost <= 0 || price <= 0) return false;
          const margin = ((price - cost) / price) * 100;
          return margin < 20;
        }).length;
      }),
      prisma.supplierChangeEvent.count({
        where: {
          applied: false,
          dismissed: false,
          changeType: "stock",
        },
      }),
    ]);

  const importReview = truth.pipeline.awaitingAdmin;
  const priceAuditHint = marginOutliers;

  const reviewByCategory: Record<string, number> = {};
  const reviewItems = await prisma.importQueueItem.findMany({
    where: { status: "review" },
    select: { mappedDraft: true, title: true },
    take: 200,
  });
  for (const item of reviewItems) {
    const draft = item.mappedDraft as { category?: string } | null;
    const cat = draft?.category || "Ukategorisert";
    reviewByCategory[cat] = (reviewByCategory[cat] || 0) + 1;
  }

  const categories = analyzeCategoryHealth(products, reviewByCategory);
  const productLite = products.map((p) => ({ name: p.name, category: p.category }));
  const gaps = findAssortmentGaps(productLite);
  const complements = buildComplementChains(productLite);

  const activeCats = categories.filter((c) => c.category !== "Ukategorisert");
  const strongestCategory =
    [...activeCats].sort((a, b) => b.healthScore - a.healthScore)[0]?.category || null;
  const weakestCategory =
    [...activeCats].filter((c) => c.activeCount > 0 || c.productCount > 0).sort(
      (a, b) => a.healthScore - b.healthScore
    )[0]?.category || null;

  const withMargin = activeCats.filter((c) => c.avgMarginPct != null);
  const bestMarginCategory =
    [...withMargin].sort((a, b) => (b.avgMarginPct || 0) - (a.avgMarginPct || 0))[0]
      ?.category || null;
  const lowestMarginCategory =
    [...withMargin].sort((a, b) => (a.avgMarginPct || 0) - (b.avgMarginPct || 0))[0]
      ?.category || null;

  const supplierMix: Record<string, number> = {};
  for (const c of categories) {
    for (const [k, v] of Object.entries(c.supplierMix)) {
      supplierMix[k] = (supplierMix[k] || 0) + v;
    }
  }

  const catalogTotals = {
    products: products.length,
    active: products.filter((p) => p.isActive).length,
    inactive: products.filter((p) => !p.isActive).length,
  };

  const livingProfile = await refreshLivingProfile({
    storeId,
    categories,
    catalogTotals,
  });

  // Soft external boost (always 0 for now)
  const boost = await getExternalIntelligenceBoost({});

  const avgHealth =
    activeCats.length > 0
      ? activeCats.reduce((s, c) => s + c.healthScore, 0) / activeCats.length
      : 30;
  const gapPenalty = Math.min(25, gaps.filter((g) => g.severity === "high").length * 8);
  const seoPenalty = Math.min(15, Math.floor(seoGaps / 10) * 3);
  const storeHealthScore = clamp(avgHealth - gapPenalty - seoPenalty + boost);

  const recommendations: IntelligenceRecommendation[] = [];
  let prio = 1;

  for (const gap of gaps.slice(0, 8)) {
    recommendations.push({
      id: `gap:${gap.id}`,
      priority: prio++,
      kind: "gap_fill",
      title: `Fyll hull: ${gap.title}`,
      why: gap.why,
      href: `/admin/buyer?mission=gap&family=${encodeURIComponent(gap.missingFamily)}&q=${encodeURIComponent(gap.suggestedQueries[0] || "")}&want=${Math.max(4, gap.expectedMin - gap.missingCount)}`,
      meta: { gapId: gap.id, severity: gap.severity },
    });
  }

  for (const chain of complements.filter((c) =>
    c.steps.some((s) => s.status === "missing")
  ).slice(0, 4)) {
    const missing = chain.steps.filter((s) => s.status !== "strong");
    recommendations.push({
      id: `comp:${chain.id}`,
      priority: prio++,
      kind: "complement",
      title: `Fullfør ${chain.name}`,
      why: [
        chain.why,
        ...missing.map((m) => `${m.label}: ${m.count === 0 ? "mangler" : `kun ${m.count}`}`),
        "Utfyller eksisterende produkter i økosystemet.",
      ],
      href: "/admin/suppliers/merchandiser",
    });
  }

  if (buyerAiCount > 0) {
    recommendations.push({
      id: "buyer:ai",
      priority: prio++,
      kind: "merchandiser",
      title: `${buyerAiCount} AI-anbefalinger venter`,
      why: [
        "Digital Buyer har kandidater klare for høyvolum-review.",
        "Åpne filtrert til AI anbefaler — ta beslutninger i review-maskinen.",
        "Du tar alltid siste beslutning før import.",
      ],
      href: "/admin/buyer?group=ai-confident",
    });
  } else if (merchSuggested > 0) {
    recommendations.push({
      id: "merch:pending",
      priority: prio++,
      kind: "merchandiser",
      title: `${merchSuggested} AI-anbefalinger venter`,
      why: [
        "AI Merchandiser har scorede kandidater klare for vurdering.",
        "For masse-review: bruk Digital Buyer.",
      ],
      href: "/admin/buyer?group=ai-confident",
    });
  }

  if (seoGaps > 0) {
    recommendations.push({
      id: "seo:gaps",
      priority: prio++,
      kind: "seo",
      title: `${seoGaps} produkter med lav SEO`,
      why: [
        "Manglende meta-tittel/beskrivelse svekker synlighet.",
        "Rask gevinst for organisk trafikk.",
      ],
      href: "/admin/products?filter=no_seo",
    });
  }

  const thin = activeCats.filter((c) => c.strategy.includes("too_small"));
  for (const c of thin.slice(0, 3)) {
    recommendations.push({
      id: `cat:thin:${c.category}`,
      priority: prio++,
      kind: "gap_fill",
      title: `${c.category} er for tynn`,
      why: [
        c.summary,
        "Øk dybden for å bli troverdig i kategorien.",
        "Prioriter produkter med høy margin og gode bilder.",
      ],
      href: `/admin/buyer?mission=gap&q=${encodeURIComponent(c.category)}&family=${encodeURIComponent(c.category)}`,
    });
  }

  recommendations.sort((a, b) => a.priority - b.priority);

  const dailyTasks: DailyTask[] = [];

  if (importReview > 0) {
    dailyTasks.push({
      id: "tasks:review",
      urgency: "high",
      title: "Godkjenn produkter",
      detail: "Importkø venter på review / publisering",
      count: importReview,
      href: "/admin/suppliers/import-queue?status=review",
      kind: "review",
    });
  }

  if (buyerAiCount > 0 || merchSuggested > 0) {
    const n = buyerAiCount > 0 ? buyerAiCount : merchSuggested;
    dailyTasks.push({
      id: "tasks:merch",
      urgency: "medium",
      title: "Importer anbefalte produkter",
      detail: "AI har rangert kandidater i Produktkjøper",
      count: n,
      href: "/admin/buyer?group=ai-confident",
      kind: "merchandiser",
    });
  }

  if (gaps.length > 0) {
    dailyTasks.push({
      id: "tasks:gaps",
      urgency: gaps.some((g) => g.severity === "high") ? "high" : "medium",
      title: "Mangler produkter i kategori",
      detail: gaps
        .slice(0, 5)
        .map((g) => familyLabelSafe(g.missingFamily))
        .join(", "),
      count: gaps.length,
      href: `/admin/buyer?mission=gap&q=${encodeURIComponent(gaps[0]?.suggestedQueries[0] || "")}&family=${encodeURIComponent(gaps[0]?.missingFamily || "")}`,
      kind: "assortment",
    });
  }

  if (weakestCategory) {
    dailyTasks.push({
      id: "tasks:improve-cat",
      urgency: "medium",
      title: "Forbedre kategori",
      detail: `Svakeste: ${weakestCategory}`,
      href: `/admin/intelligence`,
      kind: "category",
    });
  }

  if (seoGaps > 0) {
    dailyTasks.push({
      id: "tasks:seo",
      urgency: seoGaps > 20 ? "high" : "medium",
      title: "Forbedre SEO",
      detail: "Produkter mangler meta-tittel/beskrivelse",
      count: seoGaps,
      href: "/admin/products?filter=no_seo",
      kind: "seo",
    });
  }

  if (stockChanges > 0) {
    dailyTasks.push({
      id: "tasks:stock",
      urgency: "high",
      title: "Leverandør endret lager",
      detail: "Uleste sync-endringer på lager",
      count: stockChanges,
      href: "/admin/suppliers/health",
      kind: "stock",
    });
  }

  if (priceAuditHint >= 3) {
    dailyTasks.push({
      id: "tasks:price",
      urgency: "medium",
      title: "Prisjustering",
      detail: "Aktive produkter med margin under 20 %",
      count: priceAuditHint,
      href: "/admin/products/pricing-audit",
      kind: "price",
    });
  }

  const risks: string[] = [];
  if (gaps.filter((g) => g.severity === "high").length > 0) {
    risks.push("Kritiske sortimenthull svekker merkurv og kundetilfredshet.");
  }
  if (seoGaps > 20) risks.push("Stor SEO-gjeld reduserer organisk synlighet.");
  if (weakestCategory) risks.push(`Svakeste kategori: ${weakestCategory}.`);
  if (catalogTotals.active < 10) risks.push("For få aktive produkter til troverdig butikk.");

  const report: StoreIntelligenceReport = {
    storeHealthScore,
    strongestCategory,
    weakestCategory,
    bestMarginCategory,
    lowestMarginCategory,
    categories,
    gaps,
    complements,
    recommendations: recommendations.slice(0, 20),
    dailyTasks,
    supplierMix,
    risks,
    livingProfile: {
      identitySummary: livingProfile.identitySummary,
      audienceHint: livingProfile.audienceHint,
      priceLevelHint: livingProfile.priceLevelHint,
      qualityHint: livingProfile.qualityHint,
      brandHint: livingProfile.brandHint,
      styleHint: livingProfile.styleHint,
      categoryFocus: livingProfile.categoryFocus,
      preferenceModel: livingProfile.preferenceModel,
    },
    generatedAt: new Date().toISOString(),
    catalogTotals,
  };

  await prisma.storeIntelligenceSnapshot.create({
    data: {
      storeId: storeId || null,
      storeHealthScore: report.storeHealthScore,
      strongestCategory: report.strongestCategory,
      weakestCategory: report.weakestCategory,
      bestMarginCategory: report.bestMarginCategory,
      lowestMarginCategory: report.lowestMarginCategory,
      categories: report.categories,
      gaps: report.gaps,
      complements: report.complements,
      recommendations: report.recommendations as unknown as Prisma.InputJsonValue,
      dailyTasks: report.dailyTasks as unknown as Prisma.InputJsonValue,
      supplierMix: report.supplierMix,
      risks: report.risks,
    },
  });

  return report;
}

function familyLabelSafe(id: string): string {
  const map: Record<string, string> = {
    mouse_pad: "RGB musematter",
    wrist_rest: "Håndleddsstøtter",
    usb_c_hub: "USB-C docking",
    floor_mat: "Gulvmatter",
    webcam: "Premium gaming-webkamera",
    mini_pc: "Mini-PC",
    headset: "Headset",
    screen_protector: "Skjermbeskyttere",
  };
  return map[id] || id.replace(/_/g, " ");
}

export async function getLatestIntelligenceSnapshot(storeId?: string | null) {
  return prisma.storeIntelligenceSnapshot.findFirst({
    where: storeId ? { storeId } : undefined,
    orderBy: { generatedAt: "desc" },
  });
}
