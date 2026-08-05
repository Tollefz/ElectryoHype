/**
 * Parallel flush of buyer hunt candidate writes.
 * Does not change Discovery / Merch / ranking algorithms — only I/O scheduling.
 */

import "server-only";

import type { Prisma, SupplierName } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PendingFilteredWrite = {
  kind: "filtered";
  storeId: string | null;
  scanRunId: string;
  supplier: SupplierName;
  supplierProductId: string;
  title: string | null;
  imageUrl: string | null;
  supplierPrice: number;
  supplierCurrency: string;
  overallScore: number;
  shopMatchPct: number;
  shopMatchWhy: string[];
  scores: Prisma.InputJsonValue;
  reasons: Prisma.InputJsonValue;
  risks: Prisma.InputJsonValue;
  pricing: Prisma.InputJsonValue;
  discoveryTags: Prisma.InputJsonValue;
  fingerprint: string;
  filterReasons: string[];
  snapshot: Prisma.InputJsonValue;
};

export type PendingKeptWrite = {
  kind: "kept";
  storeId: string | null;
  scanRunId: string;
  supplier: SupplierName;
  supplierProductId: string;
  title: string | null;
  imageUrl: string | null;
  supplierPrice: number;
  supplierCurrency: string;
  overallScore: number;
  shopMatchPct: number;
  shopMatchWhy: string[];
  scores: Prisma.InputJsonValue;
  reasons: Prisma.InputJsonValue;
  risks: Prisma.InputJsonValue;
  pricing: Prisma.InputJsonValue;
  discoveryTags: Prisma.InputJsonValue;
  fingerprint: string;
  snapshot: Prisma.InputJsonValue;
  shelf: string;
  categoryHint: string | null;
  market: Prisma.InputJsonValue;
  visual: Prisma.InputJsonValue;
  explanation: string;
  merchReasons: string[];
};

export type PendingBuyerWrite = PendingFilteredWrite | PendingKeptWrite;

const WRITE_CONCURRENCY = Math.max(
  2,
  Math.min(12, Number(process.env.BUYER_WRITE_CONCURRENCY || 8))
);

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const idx = next++;
        await fn(items[idx]!);
      }
    }
  );
  await Promise.all(workers);
}

/**
 * Flush queued candidate (+ merch mirror) writes with bounded parallelism.
 * Merch mirror runs first for kept rows (needed for merchandiserRecId), then
 * all candidate upserts — both phases parallelized.
 */
export async function flushBuyerCandidateWrites(
  writes: PendingBuyerWrite[]
): Promise<void> {
  if (writes.length === 0) return;

  const kept = writes.filter((w): w is PendingKeptWrite => w.kind === "kept");
  const merchIds = new Map<string, string>();

  await mapPool(kept, WRITE_CONCURRENCY, async (w) => {
    const rec = await prisma.merchandiserRecommendation.upsert({
      where: {
        supplier_supplierProductId: {
          supplier: w.supplier,
          supplierProductId: w.supplierProductId,
        },
      },
      create: {
        storeId: w.storeId,
        supplier: w.supplier,
        supplierProductId: w.supplierProductId,
        title: w.title,
        imageUrl: w.imageUrl,
        supplierPrice: w.supplierPrice,
        supplierCurrency: w.supplierCurrency,
        shelf: w.shelf,
        categoryHint: w.categoryHint,
        overallScore: w.overallScore,
        scores: w.scores,
        reasons: w.merchReasons,
        risks: w.risks,
        market: w.market,
        pricing: w.pricing,
        visual: w.visual,
        explanation: w.explanation,
        snapshot: w.snapshot,
        status: "suggested",
      },
      update: {
        title: w.title,
        imageUrl: w.imageUrl,
        supplierPrice: w.supplierPrice,
        supplierCurrency: w.supplierCurrency,
        overallScore: w.overallScore,
        scores: w.scores,
        reasons: w.merchReasons,
        risks: w.risks,
        market: w.market,
        pricing: w.pricing,
        visual: w.visual,
        explanation: w.explanation,
        snapshot: w.snapshot,
        status: "suggested",
        updatedAt: new Date(),
      },
    });
    merchIds.set(`${w.supplier}:${w.supplierProductId}`, rec.id);
  });

  await mapPool(writes, WRITE_CONCURRENCY, async (w) => {
    if (w.kind === "filtered") {
      await prisma.buyerCandidate.upsert({
        where: {
          supplier_supplierProductId: {
            supplier: w.supplier,
            supplierProductId: w.supplierProductId,
          },
        },
        create: {
          storeId: w.storeId,
          scanRunId: w.scanRunId,
          supplier: w.supplier,
          supplierProductId: w.supplierProductId,
          title: w.title,
          imageUrl: w.imageUrl,
          supplierPrice: w.supplierPrice,
          supplierCurrency: w.supplierCurrency,
          overallScore: w.overallScore,
          shopMatchPct: w.shopMatchPct,
          shopMatchWhy: w.shopMatchWhy,
          scores: w.scores,
          reasons: w.reasons,
          risks: w.risks,
          pricing: w.pricing,
          discoveryTags: w.discoveryTags,
          fingerprint: w.fingerprint,
          status: "filtered",
          filterReasons: w.filterReasons,
          snapshot: w.snapshot,
        },
        // Must refresh pricing on re-hunt — CREATE-only left stale/empty NOK fields
        update: {
          scanRunId: w.scanRunId,
          title: w.title,
          imageUrl: w.imageUrl,
          supplierPrice: w.supplierPrice,
          supplierCurrency: w.supplierCurrency,
          overallScore: w.overallScore,
          shopMatchPct: w.shopMatchPct,
          shopMatchWhy: w.shopMatchWhy,
          status: "filtered",
          filterReasons: w.filterReasons,
          scores: w.scores,
          reasons: w.reasons,
          risks: w.risks,
          pricing: w.pricing,
          discoveryTags: w.discoveryTags,
          fingerprint: w.fingerprint,
          snapshot: w.snapshot,
          rank: null,
          updatedAt: new Date(),
        },
      });
      return;
    }

    const merchId = merchIds.get(`${w.supplier}:${w.supplierProductId}`) || null;
    await prisma.buyerCandidate.upsert({
      where: {
        supplier_supplierProductId: {
          supplier: w.supplier,
          supplierProductId: w.supplierProductId,
        },
      },
      create: {
        storeId: w.storeId,
        scanRunId: w.scanRunId,
        supplier: w.supplier,
        supplierProductId: w.supplierProductId,
        title: w.title,
        imageUrl: w.imageUrl,
        supplierPrice: w.supplierPrice,
        supplierCurrency: w.supplierCurrency,
        overallScore: w.overallScore,
        shopMatchPct: w.shopMatchPct,
        shopMatchWhy: w.shopMatchWhy,
        scores: w.scores,
        reasons: w.reasons,
        risks: w.risks,
        pricing: w.pricing,
        discoveryTags: w.discoveryTags,
        fingerprint: w.fingerprint,
        groupId: w.fingerprint,
        isBestInGroup: true,
        status: "ranked",
        merchandiserRecId: merchId,
        snapshot: w.snapshot,
      },
      // Must refresh pricing on re-hunt — CREATE-only left stale/empty NOK fields
      update: {
        scanRunId: w.scanRunId,
        title: w.title,
        imageUrl: w.imageUrl,
        supplierPrice: w.supplierPrice,
        supplierCurrency: w.supplierCurrency,
        overallScore: w.overallScore,
        shopMatchPct: w.shopMatchPct,
        shopMatchWhy: w.shopMatchWhy,
        scores: w.scores,
        reasons: w.reasons,
        risks: w.risks,
        pricing: w.pricing,
        discoveryTags: w.discoveryTags,
        fingerprint: w.fingerprint,
        groupId: w.fingerprint,
        isBestInGroup: true,
        status: "ranked",
        filterReasons: [],
        merchandiserRecId: merchId,
        snapshot: w.snapshot,
        rank: null,
        updatedAt: new Date(),
      },
    });
  });
}
