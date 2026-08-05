/**
 * Autonomous Commerce Engine — orchestrator.
 * Coordinates existing engines; never auto-publishes.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateAutonomyPolicy } from "@/lib/autonomy/policy";
import { runAutonomyQualityGate } from "@/lib/autonomy/quality-gate";
import { refreshStoreMemory, memoryFitScore } from "@/lib/autonomy/memory";
import {
  discoverAutonomyTasks,
  syncAutonomyTasks,
} from "@/lib/autonomy/tasks";
import { buildMorningBrief } from "@/lib/autonomy/brief";
import type {
  AutonomyMode,
  AutonomyRunSummary,
  AutonomyStepLog,
  ExplainedDecision,
} from "@/lib/autonomy/types";
import { logError } from "@/lib/utils/logger";

export type RunAutonomyOptions = {
  storeId?: string | null;
  trigger?: string;
  /** Override policy mode for this run only */
  modeOverride?: AutonomyMode;
  /** Skip heavy merchandiser scan (hourly light mode) */
  light?: boolean;
};

async function timed<T>(
  name: string,
  steps: AutonomyStepLog[],
  fn: () => Promise<T>
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    steps.push({ name, ok: true, ms: Date.now() - t0 });
    return result;
  } catch (error) {
    steps.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : "feil",
      ms: Date.now() - t0,
    });
    throw error;
  }
}

export async function runAutonomyCycle(opts: RunAutonomyOptions = {}) {
  const policy = await getOrCreateAutonomyPolicy(opts.storeId);
  const mode = opts.modeOverride || policy.mode;
  const trigger = opts.trigger || "manual";
  const light = Boolean(opts.light);

  const run = await prisma.autonomyRun.create({
    data: {
      storeId: opts.storeId || null,
      trigger,
      status: "running",
      mode,
      steps: [],
    },
  });

  const steps: AutonomyStepLog[] = [];
  const decisions: ExplainedDecision[] = [];

  const summary: AutonomyRunSummary = {
    productsAnalyzed: 0,
    newCandidatesFound: 0,
    fittedProfile: 0,
    imported: 0,
    passedQualityGate: 0,
    readyForPublish: 0,
    priceUpdates: 0,
    outOfStock: 0,
    needImages: 0,
    weakSeo: 0,
    criticalErrors: 0,
    tasksOpened: 0,
  };

  try {
    // 1) Store memory refresh
    const memory = await timed("store_memory", steps, () =>
      refreshStoreMemory(opts.storeId)
    );

    // 2) Store Intelligence (catalog brain)
    let storeHealthScore: number | null = null;
    if (!light) {
      const intel = await timed("store_intelligence", steps, async () => {
        const { buildStoreIntelligence } = await import("@/lib/intelligence");
        return buildStoreIntelligence(opts.storeId);
      });
      storeHealthScore = intel.storeHealthScore;
      summary.productsAnalyzed = intel.catalogTotals.products;
    } else {
      summary.productsAnalyzed = await prisma.product.count(
        opts.storeId ? { where: { storeId: opts.storeId } } : undefined
      );
      steps.push({ name: "store_intelligence", ok: true, detail: "skipped (light)" });
    }

    // 3) Discover + sync proactive tasks
    const discovered = await timed("discover_tasks", steps, () =>
      discoverAutonomyTasks(opts.storeId)
    );
    summary.tasksOpened = await syncAutonomyTasks(discovered, opts.storeId);
    summary.weakSeo = discovered.find((t) => t.kind === "weak_seo")?.count || 0;
    summary.needImages = discovered.find((t) => t.kind === "bad_images")?.count || 0;
    summary.outOfStock = discovered.find((t) => t.kind === "stock_changed")?.count || 0;
    summary.priceUpdates = discovered.find((t) => t.kind === "price_changed")?.count || 0;
    summary.criticalErrors =
      discovered.find((t) => t.kind === "import_failed")?.count || 0;
    summary.readyForPublish =
      discovered.find((t) => t.kind === "ready_to_publish")?.count || 0;

    // 4) Merchandiser scan (find → analyze → score)
    if (!light && mode !== "off") {
      const scan = await timed("merchandiser_scan", steps, async () => {
        const { runMerchandiserScan } = await import(
          "@/lib/suppliers/merchandiser/scanner"
        );
        return runMerchandiserScan({
          storeId: opts.storeId,
          targetCount: Math.min(25, Math.max(policy.maxImportsPerRun * 2, 10)),
          deepAnalyzeTop: policy.deepAnalyzeTop,
          autoQueue: false,
          actorEmail: "autonomy@electrohypex",
        });
      });
      summary.newCandidatesFound = scan.recommended;
    } else if (mode === "off" && !light) {
      // Still scan in OFF so we can propose — but don't import
      const scan = await timed("merchandiser_scan_suggest", steps, async () => {
        const { runMerchandiserScan } = await import(
          "@/lib/suppliers/merchandiser/scanner"
        );
        return runMerchandiserScan({
          storeId: opts.storeId,
          targetCount: 15,
          deepAnalyzeTop: 5,
          autoQueue: false,
          actorEmail: "autonomy@electrohypex",
        });
      });
      summary.newCandidatesFound = scan.recommended;
    }

    // 5) Filter candidates via memory + quality gate
    const candidates = await prisma.merchandiserRecommendation.findMany({
      where: {
        status: { in: ["suggested", "accepted"] },
        overallScore: { gte: policy.minMerchandiserScore },
      },
      orderBy: { overallScore: "desc" },
      take: policy.maxImportsPerRun * 3,
    });

    const acceptedIds: string[] = [];

    for (const c of candidates) {
      const pricing = c.pricing as {
        estimatedMarginPct?: number;
        estimatedRetailNOK?: number;
        premiumPotential?: boolean;
      } | null;
      const snapshot = c.snapshot as {
        images?: string[];
        specs?: number;
        variantCount?: number;
      } | null;
      const visual = c.visual as { chineseTextRisk?: boolean } | null;

      const mem = memoryFitScore(memory, {
        title: c.title || "",
        categoryHint: c.categoryHint,
        shelf: c.shelf,
        retailNOK: pricing?.estimatedRetailNOK,
        premiumPotential: pricing?.premiumPotential,
      });

      if (mem.score < 45) {
        const d: ExplainedDecision = {
          stage: "filter",
          subjectKey: c.id,
          action: "reject",
          confidence: mem.score,
          why: ["Lav fit mot Store Memory", ...mem.why],
          risks: ["Passer dårlig til innlærte preferanser"],
        };
        decisions.push(d);
        continue;
      }

      summary.fittedProfile += 1;

      const gate = runAutonomyQualityGate(
        {
          title: c.title || c.supplierProductId,
          category: c.categoryHint,
          imageCount: snapshot?.images?.length || (c.imageUrl ? 1 : 0),
          specCount: typeof snapshot?.specs === "number" ? snapshot.specs : 0,
          marginPct: pricing?.estimatedMarginPct ?? null,
          merchandiserScore: c.overallScore,
          hasSuspiciousContent: Boolean(visual?.chineseTextRisk),
        },
        policy.qualityGate
      );

      decisions.push({
        ...gate.decision,
        subjectKey: c.id,
        data: {
          ...gate.decision.data,
          memoryScore: mem.score,
          memoryWhy: mem.why,
        },
      });

      if (!gate.passed) continue;
      summary.passedQualityGate += 1;
      acceptedIds.push(c.id);
      if (acceptedIds.length >= policy.maxImportsPerRun) break;
    }

    // 6) Import according to mode
    if (mode === "off") {
      steps.push({
        name: "import",
        ok: true,
        detail: `OFF — ${acceptedIds.length} kandidater klare (ikke importert)`,
      });
      summary.imported = 0;
      // Record suggestions as decisions only
      for (const id of acceptedIds) {
        decisions.push({
          stage: "import",
          subjectKey: id,
          action: "skip",
          confidence: 90,
          why: ["Modus OFF — foreslår kun, importerer ikke"],
          risks: [],
        });
      }
    } else if (acceptedIds.length > 0) {
      const { queueRecommendationsToImport } = await import(
        "@/lib/suppliers/merchandiser/actions"
      );
      const importResults = await timed("import_queue", steps, () =>
        queueRecommendationsToImport({
          ids: acceptedIds,
          actorEmail: "autonomy@electrohypex",
          storeId: opts.storeId,
        })
      );
      summary.imported = importResults.filter((r) => r.ok).length;

      for (const r of importResults) {
        decisions.push({
          stage: "import",
          subjectKey: r.id,
          action: r.ok ? "queue" : "reject",
          confidence: r.ok ? 95 : 40,
          why: r.ok
            ? ["Lagt i Import Queue via Merchandiser"]
            : [r.error || "Import feilet"],
          risks: r.ok ? ["Krever fortsatt review/publish av admin"] : ["Import feilet"],
          data: { queueItemId: r.queueItemId },
        });
      }
    }

    // 7) AUTO: process queue (enrich/SEO/price/category via existing pipeline)
    if (mode === "auto" && summary.imported > 0) {
      await timed("process_imports", steps, async () => {
        const { runSupplierWorkers } = await import(
          "@/lib/suppliers/workers/jobs"
        );
        return runSupplierWorkers({
          concurrency: 3,
          limit: policy.maxImportsPerRun,
          types: ["import_item"],
        });
      });

      // Refresh ready-for-publish count after processing
      summary.readyForPublish = await prisma.importQueueItem.count({
        where: { status: { in: ["approved", "review"] } },
      });
      steps.push({
        name: "never_auto_publish",
        ok: true,
        detail: "Publisering er alltid manuell",
      });
    } else if (mode === "semi") {
      steps.push({
        name: "process_imports",
        ok: true,
        detail: "SEMI — admin behandler/publiserer selv",
      });
    }

    // Persist decisions
    if (decisions.length > 0) {
      await prisma.autonomyDecision.createMany({
        data: decisions.slice(0, 200).map((d) => ({
          runId: run.id,
          stage: d.stage,
          subjectKey: d.subjectKey,
          action: d.action,
          confidence: d.confidence,
          why: d.why,
          data: (d.data || undefined) as Prisma.InputJsonValue | undefined,
          risks: d.risks,
        })),
      });
    }

    const morningBrief = buildMorningBrief({
      mode,
      summary,
      storeHealthScore,
    });

    await prisma.autonomyRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        steps,
        summary,
        morningBrief,
        finishedAt: new Date(),
      },
    });

    return {
      ok: true as const,
      runId: run.id,
      mode,
      summary,
      morningBrief,
      steps,
      decisionsCount: decisions.length,
    };
  } catch (error) {
    logError(error, "[autonomy/orchestrator]");
    await prisma.autonomyRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        steps,
        summary,
        error: error instanceof Error ? error.message : "Autonomy run feilet",
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function getLatestAutonomyBrief(storeId?: string | null) {
  return prisma.autonomyRun.findFirst({
    where: {
      status: "completed",
      morningBrief: { not: null },
      ...(storeId ? { storeId } : {}),
    },
    orderBy: { finishedAt: "desc" },
  });
}

export async function listAutonomyRuns(limit = 10) {
  return prisma.autonomyRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
