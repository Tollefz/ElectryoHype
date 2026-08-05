/**
 * Weekly AI self-evaluation — only factual admin actions and measured KPIs.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildEngineScorecards } from "@/lib/trust/scorecard";
import { buildStoreAiKpis } from "@/lib/trust/kpis";
import { refreshStoreMemory } from "@/lib/autonomy/memory";
import { getOrCreateShopProfile, updateShopProfile } from "@/lib/suppliers/merchandiser/shop-profile";
import type { SelfEvalResult } from "@/lib/trust/types";
import { getAdminTruth } from "@/lib/ops/admin-truth";

function fmt(n: number): string {
  return n.toLocaleString("no-NO");
}

export async function runAiSelfEvaluation(opts?: {
  storeId?: string | null;
  days?: number;
}): Promise<SelfEvalResult & { id: string }> {
  const days = opts?.days ?? 7;
  const periodEnd = new Date();
  const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [scorecards, kpis, memory, merchStats, buyerScan, overrides, feedbackEvents, truth] =
    await Promise.all([
      buildEngineScorecards(days),
      buildStoreAiKpis(),
      refreshStoreMemory(opts?.storeId),
      prisma.merchandiserDecision.groupBy({
        by: ["decision"],
        where: { createdAt: { gte: periodStart } },
        _count: true,
      }),
      prisma.buyerScanRun.aggregate({
        where: { createdAt: { gte: periodStart } },
        _sum: { scanned: true, kept: true, filtered: true },
      }),
      prisma.aiOverride.findMany({
        where: { createdAt: { gte: periodStart } },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.aiFeedbackEvent.findMany({
        where: { createdAt: { gte: periodStart } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { kind: true, metadata: true },
      }),
      getAdminTruth({ storeId: opts?.storeId }),
    ]);

  const decisionMap = Object.fromEntries(
    merchStats.map((r) => [r.decision, r._count])
  );
  const recommended =
    (decisionMap.accept || 0) +
    (decisionMap.queue || 0) +
    (buyerScan._sum.kept || 0);
  const published = truth.activity7d.published;
  const rejected =
    (decisionMap.reject || 0) + (decisionMap.dismiss || 0);

  const categoryMoves = feedbackEvents.filter(
    (e) => e.kind === "category_change"
  ).length;
  const priceEdits = feedbackEvents.filter(
    (e) => e.kind === "price_change"
  ).length;
  const manualApprovals = feedbackEvents.filter(
    (e) => e.kind === "approve" || e.kind === "publish" || e.kind === "queue"
  ).length;
  const aiRejects = feedbackEvents.filter((e) => e.kind === "reject").length;
  const edited = feedbackEvents.filter((e) =>
    ["edit", "price_change", "category_change", "seo_change"].includes(e.kind)
  ).length;

  const learnings: string[] = [];

  if (categoryMoves > 0) {
    learnings.push(
      `${fmt(categoryMoves)} produkter flyttet mellom kategorier av administrator`
    );
  }
  if (priceEdits > 0) {
    learnings.push(`${fmt(priceEdits)} manuelle prisjusteringer`);
  }
  if (manualApprovals > 0) {
    learnings.push(`${fmt(manualApprovals)} manuelle godkjenninger / kø-handlinger`);
  }
  if (aiRejects > 0) {
    learnings.push(`${fmt(aiRejects)} AI-forslag avvist av administrator`);
  }
  for (const o of overrides.slice(0, 8)) {
    learnings.push(
      `Ny regel / overstyring: ${o.field} — AI «${o.aiValue.slice(0, 40)}» → admin «${o.humanValue.slice(0, 40)}»`
    );
  }
  if (memory.favoriteCategories?.length) {
    learnings.push(
      `Kategorier med flest godkjenninger: ${memory.favoriteCategories.slice(0, 4).join(", ")}`
    );
  }
  if (!learnings.length) {
    learnings.push("Ikke nok data — ingen administratorhandlinger i perioden");
  }

  // Soft profile updates only when we have real category preference evidence
  const profile = await getOrCreateShopProfile(opts?.storeId);
  const profileUpdates: Record<string, unknown> = {};
  if (memory.favoriteCategories?.length) {
    const merged = [
      ...new Set([...memory.favoriteCategories, ...profile.categories]),
    ].slice(0, 8);
    if (JSON.stringify(merged) !== JSON.stringify(profile.categories)) {
      await updateShopProfile({ categories: merged }, opts?.storeId);
      profileUpdates.categories = merged;
    }
  }

  const analyzed = buyerScan._sum.scanned || truth.activity7d.productsAnalyzed;
  const timeSaved =
    truth.activity7d.estimatedMinutesSaved != null
      ? Math.round((truth.activity7d.estimatedMinutesSaved / 60) * 10) / 10
      : null;

  const summaryLines = [
    `Denne ${days === 7 ? "uken" : `perioden (${days} dager)`}:`,
    "",
  ];
  if (analyzed > 0) summaryLines.push(`${fmt(analyzed)} produkter analysert.`);
  if (recommended > 0) summaryLines.push(`${fmt(recommended)} anbefalt.`);
  if (published > 0) summaryLines.push(`${fmt(published)} publisert.`);
  if (edited > 0) summaryLines.push(`${fmt(edited)} manuelle endringer.`);
  if (rejected > 0) summaryLines.push(`${fmt(rejected)} avvist.`);
  if (categoryMoves > 0) {
    summaryLines.push(`${fmt(categoryMoves)} kategori-flytt.`);
  }
  if (priceEdits > 0) summaryLines.push(`${fmt(priceEdits)} prisjusteringer.`);

  if (summaryLines.length <= 2) {
    summaryLines.push("Ikke nok data for perioden.");
  }

  summaryLines.push("", "Observasjoner:", ...learnings.map((l) => `- ${l}`));

  if (Object.keys(profileUpdates).length) {
    summaryLines.push("", "Butikkprofil oppdatert basert på faktiske valg.");
  }

  if (kpis.hitRate > 0) {
    summaryLines.push("", `AI-treffprosent: ${kpis.hitRate}%.`);
  } else {
    summaryLines.push("", "AI-treffprosent: Ikke nok data.");
  }
  if (timeSaved != null && timeSaved > 0) {
    summaryLines.push(`Estimert tid spart (fra AI-operasjoner): ${timeSaved} t.`);
  } else {
    summaryLines.push("Estimert tid spart: Ikke nok data.");
  }

  const summaryText = summaryLines.join("\n");

  const result: SelfEvalResult = {
    summaryText,
    scorecards,
    kpis,
    learnings,
    profileUpdates,
  };

  const row = await prisma.aiSelfEvalRun.create({
    data: {
      storeId: opts?.storeId || null,
      periodStart,
      periodEnd,
      summaryText,
      scorecards: scorecards as unknown as Prisma.InputJsonValue,
      kpis: kpis as unknown as Prisma.InputJsonValue,
      learnings,
      profileUpdates: profileUpdates as Prisma.InputJsonValue,
    },
  });

  if (overrides.length) {
    await prisma.aiOverride.updateMany({
      where: { id: { in: overrides.map((o) => o.id) } },
      data: { learned: true },
    });
  }

  return { id: row.id, ...result };
}

export async function getLatestSelfEval() {
  return prisma.aiSelfEvalRun.findFirst({
    orderBy: { createdAt: "desc" },
  });
}
