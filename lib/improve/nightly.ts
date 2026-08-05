/**
 * Nightly self-improve cycle — discover, score, summarize for Rob's Desk.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { discoverImprovements } from "@/lib/improve/discover";
import { ensureDefaultMissions } from "@/lib/improve/missions";
import { getOrCreateStoreObjectives } from "@/lib/improve/objectives";
import { buildNightlyAiReview } from "@/lib/real-store/review";
import { runCatalogQualityChecks } from "@/lib/real-store/catalog-qa";
import { buildAutomationScore } from "@/lib/real-store/automation";

export async function runNightlySelfImprove(opts?: { storeId?: string | null }) {
  const run = await prisma.storeImproveRun.create({
    data: {
      storeId: opts?.storeId || null,
      status: "running",
      startedAt: new Date(),
    },
  });

  try {
    await getOrCreateStoreObjectives(opts?.storeId);
    await ensureDefaultMissions(opts?.storeId);

    const stats = await discoverImprovements({
      storeId: opts?.storeId,
      runId: run.id,
      maxProposals: 40,
    });

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [improved, published, avgQ, removed, catalogIssues, automation] =
      await Promise.all([
      prisma.storeImprovement.count({
        where: {
          status: "applied",
          appliedAt: { gte: weekAgo },
          kind: { notIn: ["retire_unpublish", "retire_archive"] },
        },
      }),
      prisma.importQueueItem.count({
        where: { status: "published", publishedAt: { gte: weekAgo } },
      }),
      prisma.product.aggregate({
        where: { qualityScore: { not: null } },
        _avg: { qualityScore: true },
      }),
      prisma.storeImprovement.count({
        where: {
          status: "applied",
          appliedAt: { gte: weekAgo },
          kind: { in: ["retire_unpublish", "retire_archive"] },
        },
      }),
      runCatalogQualityChecks(opts?.storeId),
      buildAutomationScore(),
    ]);

    const counts = await prisma.storeImprovement.groupBy({
      by: ["kind"],
      where: { status: "pending", createdAt: { gte: new Date(Date.now() - 36 * 60 * 60 * 1000) } },
      _count: { _all: true },
    });

    const aiReview = buildNightlyAiReview({
      stats,
      catalogIssues,
      adminMinutesEst: automation.adminMinutesPerDayEst,
    });

    const lines = [
      "Hva kan forbedres i natt?",
      "",
      ...counts.map((c) => `${c._count._all} × ${labelKind(c.kind)}`),
      "",
      `${stats.productsScored} produkter fikk oppdatert kvalitetsscore.`,
      `Snittkvalitet: ${stats.avgQualityBefore ?? "—"}/100.`,
      `${stats.improvementsCreated} forbedringsforslag.`,
      `${stats.retirementProposed} pensjoneringsforslag.`,
      `${stats.pendingApprovals} venter på din godkjenning.`,
      "",
      "Mål denne uken:",
      `✔ ${improved} produkter forbedret`,
      `✔ ${published} nye/publiserte`,
      `✔ Snittkvalitet ${avgQ._avg.qualityScore != null ? Math.round(avgQ._avg.qualityScore) : "—"}`,
      `✔ ${removed} dårlige produkter fjernet`,
      "",
      aiReview,
    ];

    const summaryText = lines.join("\n");

    await prisma.storeImproveRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        summaryText,
        stats: {
          ...stats,
          weekImproved: improved,
          weekPublished: published,
          weekRemoved: removed,
          avgQuality: avgQ._avg.qualityScore,
          byKind: Object.fromEntries(counts.map((c) => [c.kind, c._count._all])),
          aiReview,
          automationOverall: automation.overallPct,
          adminMinutesPerDayEst: automation.adminMinutesPerDayEst,
        } as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });

    return {
      ok: true as const,
      runId: run.id,
      summaryText,
      stats,
      aiReview,
    };
  } catch (error) {
    await prisma.storeImproveRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        summaryText: error instanceof Error ? error.message : "Feil",
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}

function labelKind(kind: string): string {
  const map: Record<string, string> = {
    seo: "svak SEO",
    description: "bør få bedre beskrivelser",
    images: "for få bilder",
    category: "bør flyttes kategori",
    price: "priser bør justeres",
    specs: "dårlige/manglende spesifikasjoner",
    tags: "tags",
    retire_unpublish: "avpubliser",
    retire_replace: "erstatt",
    retire_archive: "arkiver",
    switch_supplier: "bytt leverandør",
    update: "oppdater",
  };
  return map[kind] || kind;
}

export async function getLatestImproveRun() {
  return prisma.storeImproveRun.findFirst({
    orderBy: { createdAt: "desc" },
  });
}

export async function getDeskImproveBundle() {
  const [objectives, pending, missions, latestRun, weekStats] = await Promise.all([
    (await import("@/lib/improve/objectives")).getOrCreateStoreObjectives(),
    prisma.storeImprovement.findMany({
      where: { status: "pending" },
      orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
      take: 12,
      include: {
        product: { select: { id: true, name: true, slug: true, qualityScore: true } },
      },
    }),
    prisma.storeMission.findMany({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    getLatestImproveRun(),
    (async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [improved, published, removed] = await Promise.all([
        prisma.storeImprovement.count({
          where: { status: "applied", appliedAt: { gte: weekAgo } },
        }),
        prisma.importQueueItem.count({
          where: { status: "published", publishedAt: { gte: weekAgo } },
        }),
        prisma.storeImprovement.count({
          where: {
            status: "applied",
            appliedAt: { gte: weekAgo },
            kind: { in: ["retire_unpublish", "retire_archive"] },
          },
        }),
      ]);
      return { improved, published, removed };
    })(),
  ]);

  return { objectives, pending, missions, latestRun, weekStats };
}
