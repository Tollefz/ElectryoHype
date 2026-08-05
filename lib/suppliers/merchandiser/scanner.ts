/**
 * AI Merchandiser scanner — walks active SupplierProviders, scores, persists.
 * Provider-agnostic; never touches vendor plugins directly.
 */

import "server-only";

import type { Prisma, SupplierName } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getCatalogProvider,
  listActiveCatalogSupplierIds,
} from "@/lib/suppliers/registry";
import type { CatalogSupplierId } from "@/lib/suppliers/provider";
import { getOrCreateShopProfile } from "@/lib/suppliers/merchandiser/shop-profile";
import { analyzeSearchProduct, analyzeProductDetail } from "@/lib/suppliers/merchandiser/scoring";
import { analyzeProductImagesWithAI, heuristicVisualAdvice } from "@/lib/suppliers/merchandiser/visual";
import { refineAnalysisWithAI } from "@/lib/suppliers/merchandiser/market";
import { buildScanSeeds } from "@/lib/suppliers/merchandiser/seeds";
import { getTrendBoost } from "@/lib/suppliers/merchandiser/trends";
import type { MerchandiserShelf } from "@/lib/suppliers/merchandiser/types";
import { logError } from "@/lib/utils/logger";

function toSupplierName(id: CatalogSupplierId): SupplierName {
  return id as SupplierName;
}

export type MerchandiserScanOptions = {
  storeId?: string | null;
  /** How many recommendations to keep (10 | 25 | 100). */
  targetCount?: number;
  shelves?: MerchandiserShelf[];
  suppliers?: CatalogSupplierId[];
  /** Fetch full detail + optional vision for top candidates. */
  deepAnalyzeTop?: number;
  /** When true, enqueue score >= autoQueueMinScore into Import Queue (review). */
  autoQueue?: boolean;
  actorEmail?: string | null;
};

export async function runMerchandiserScan(opts: MerchandiserScanOptions = {}) {
  const profile = await getOrCreateShopProfile(opts.storeId);
  const settings = profile.merchandiserSettings;
  const targetCount = opts.targetCount || settings.defaultBatchSize || 25;
  const deepAnalyzeTop = opts.deepAnalyzeTop ?? Math.min(12, targetCount);
  const autoQueue = opts.autoQueue ?? settings.autoQueueEnabled;
  const minShow = settings.minScoreToShow ?? 55;

  const supplierIds = (
    opts.suppliers?.length ? opts.suppliers : listActiveCatalogSupplierIds()
  ).filter(Boolean) as CatalogSupplierId[];

  const scanRun = await prisma.merchandiserScanRun.create({
    data: {
      storeId: opts.storeId || null,
      status: "running",
      startedAt: new Date(),
      request: {
        targetCount,
        shelves: opts.shelves || null,
        deepAnalyzeTop,
        autoQueue,
      },
      suppliers: supplierIds,
    },
  });

  let scanned = 0;
  let recommended = 0;
  let autoQueued = 0;

  type Candidate = {
    supplier: CatalogSupplierId;
    productId: string;
    title: string;
    imageUrl: string | null;
    price: number;
    currency: string;
    shelf: MerchandiserShelf;
    analysis: ReturnType<typeof analyzeSearchProduct>;
    snapshot: Prisma.InputJsonValue;
  };

  const pool: Candidate[] = [];
  const seen = new Set<string>();

  try {
    const seeds = buildScanSeeds(profile, opts.shelves);

    for (const supplierId of supplierIds) {
      const provider = getCatalogProvider(supplierId);
      if (!(await provider.isConfigured())) continue;

      for (const seed of seeds) {
        try {
          const result = await provider.searchProducts({
            query: seed.query,
            sortBy: seed.sortBy,
            page: 1,
            pageSize: 20,
          });

          for (const p of result.products) {
            const key = `${supplierId}:${p.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            scanned += 1;

            const analysis = analyzeSearchProduct(p, {
              profile,
              shelf: seed.shelf,
            });

            // Soft trend hook (always 0 until wired)
            const boost = await getTrendBoost({
              keywords: [p.title, seed.query],
              category: p.category,
            });
            if (boost) {
              analysis.scores.overall = Math.min(
                100,
                analysis.scores.overall + boost
              );
            }

            if (analysis.scores.overall < minShow) continue;

            pool.push({
              supplier: supplierId,
              productId: p.id,
              title: p.title,
              imageUrl: p.imageUrl,
              price: p.price,
              currency: p.currency,
              shelf: seed.shelf === "today" ? "today" : analysis.shelf,
              analysis,
              snapshot: {
                id: p.id,
                sku: p.sku,
                title: p.title,
                imageUrl: p.imageUrl,
                price: p.price,
                currency: p.currency,
                category: p.category,
                stock: p.stock,
                variantCount: p.variantCount,
                listedCount: p.listedCount,
                deliveryTime: p.deliveryTime,
                warehouse: p.warehouse,
              },
            });
          }
        } catch (error) {
          logError(error, `[merchandiser/scan:${supplierId}:${seed.query}]`);
        }
      }
    }

    // Rank and keep top N (prefer diversity across shelves)
    pool.sort((a, b) => b.analysis.scores.overall - a.analysis.scores.overall);

    const picked: Candidate[] = [];
    const shelfCounts = new Map<string, number>();
    for (const c of pool) {
      if (picked.length >= targetCount) break;
      const sc = shelfCounts.get(c.shelf) || 0;
      const maxPerShelf = Math.max(3, Math.ceil(targetCount / 4));
      if (c.shelf !== "today" && sc >= maxPerShelf) continue;
      picked.push(c);
      shelfCounts.set(c.shelf, sc + 1);
    }
    // Fill remaining with best overall
    for (const c of pool) {
      if (picked.length >= targetCount) break;
      if (!picked.includes(c)) picked.push(c);
    }

    // Deep analyze top
    for (const c of picked.slice(0, deepAnalyzeTop)) {
      try {
        const provider = getCatalogProvider(c.supplier);
        const detail = await provider.getProduct(c.productId);
        if (!detail) continue;

        let visual = heuristicVisualAdvice({
          images: detail.images || [],
          title: detail.title,
          description: detail.description,
        });
        const aiVisual = await analyzeProductImagesWithAI({
          images: detail.images || [],
          title: detail.title,
          profile,
        });
        if (aiVisual) visual = aiVisual;

        let analysis = analyzeProductDetail(
          detail,
          { profile, shelf: c.shelf },
          visual
        );
        analysis = await refineAnalysisWithAI({
          title: detail.title,
          category: detail.category,
          analysis,
          profile,
        });
        c.analysis = analysis;
        c.title = detail.title;
        c.imageUrl = detail.images?.[0] || c.imageUrl;
        c.price = detail.price;
        c.currency = detail.currency;
        c.snapshot = {
          ...(c.snapshot as object),
          images: detail.images?.slice(0, 8),
          variantCount: detail.variants?.length,
          specs: Object.keys(detail.specifications || {}).length,
          videos: detail.videos?.length || 0,
        };
      } catch (error) {
        logError(error, `[merchandiser/deep:${c.supplier}:${c.productId}]`);
      }
    }

    picked.sort((a, b) => b.analysis.scores.overall - a.analysis.scores.overall);

    for (const c of picked) {
      const row = await prisma.merchandiserRecommendation.upsert({
        where: {
          supplier_supplierProductId: {
            supplier: toSupplierName(c.supplier),
            supplierProductId: c.productId,
          },
        },
        create: {
          storeId: opts.storeId || null,
          scanRunId: scanRun.id,
          supplier: toSupplierName(c.supplier),
          supplierProductId: c.productId,
          title: c.title,
          imageUrl: c.imageUrl,
          supplierPrice: c.price,
          supplierCurrency: c.currency,
          shelf: c.shelf,
          categoryHint: c.analysis.categoryHint,
          overallScore: c.analysis.scores.overall,
          scores: c.analysis.scores,
          reasons: c.analysis.reasons,
          risks: c.analysis.risks,
          market: c.analysis.market,
          pricing: c.analysis.pricing,
          visual: c.analysis.visual,
          explanation: c.analysis.explanation,
          snapshot: c.snapshot,
          status: "suggested",
        },
        update: {
          scanRunId: scanRun.id,
          title: c.title,
          imageUrl: c.imageUrl,
          supplierPrice: c.price,
          supplierCurrency: c.currency,
          shelf: c.shelf,
          categoryHint: c.analysis.categoryHint,
          overallScore: c.analysis.scores.overall,
          scores: c.analysis.scores,
          reasons: c.analysis.reasons,
          risks: c.analysis.risks,
          market: c.analysis.market,
          pricing: c.analysis.pricing,
          visual: c.analysis.visual,
          explanation: c.analysis.explanation,
          snapshot: c.snapshot,
          status: "suggested",
        },
      });
      recommended += 1;

      if (
        autoQueue &&
        c.analysis.scores.overall >= (settings.autoQueueMinScore || 95) &&
        row.status !== "queued" &&
        row.status !== "imported"
      ) {
        try {
          const provider = getCatalogProvider(c.supplier);
          const result = await provider.importProducts([c.productId], {
            createdByEmail: opts.actorEmail || "merchandiser@auto",
            storeId: opts.storeId || null,
          });
          await prisma.merchandiserRecommendation.update({
            where: { id: row.id },
            data: {
              status: "queued",
              importQueueItemId: result.queueItemIds[0] || null,
            },
          });
          autoQueued += 1;
        } catch (error) {
          logError(error, `[merchandiser/auto-queue:${c.productId}]`);
        }
      }
    }

    await prisma.merchandiserScanRun.update({
      where: { id: scanRun.id },
      data: {
        status: "completed",
        scanned,
        recommended,
        autoQueued,
        finishedAt: new Date(),
      },
    });

    return {
      ok: true as const,
      scanRunId: scanRun.id,
      scanned,
      recommended,
      autoQueued,
    };
  } catch (error) {
    logError(error, "[merchandiser/scan]");
    await prisma.merchandiserScanRun.update({
      where: { id: scanRun.id },
      data: {
        status: "failed",
        scanned,
        recommended,
        autoQueued,
        error: error instanceof Error ? error.message : "Scan feilet",
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}
