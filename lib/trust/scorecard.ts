/**
 * AI Scorecard — aggregate metrics per engine from existing decisions + feedback.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  AI_ENGINE_LABELS,
  type AiEngineId,
  type EngineScorecard,
} from "@/lib/trust/types";

function rate(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function emptyCard(engine: AiEngineId): EngineScorecard {
  return {
    engine,
    label: AI_ENGINE_LABELS[engine],
    decisions: 0,
    approvals: 0,
    rejections: 0,
    approvalRate: 0,
    rejectionRate: 0,
    hitRate: 0,
    avgConfidence: null,
    avgProcessingMs: null,
  };
}

export async function buildEngineScorecards(days = 30): Promise<EngineScorecard[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    merchDecisions,
    catDecisions,
    autonomyDecisions,
    buyerAlts,
    buyerCands,
    feedback,
    autonomyRuns,
    qgDecisions,
  ] = await Promise.all([
    prisma.merchandiserDecision.findMany({
      where: { createdAt: { gte: since } },
      select: { decision: true },
    }),
    prisma.categoryManagerDecision.findMany({
      where: { createdAt: { gte: since } },
      select: { decision: true },
    }),
    prisma.autonomyDecision.findMany({
      where: { createdAt: { gte: since } },
      select: { action: true, confidence: true },
    }),
    prisma.buyerAltOffer.findMany({
      where: { updatedAt: { gte: since }, status: { in: ["accepted", "dismissed"] } },
      select: { status: true, confidence: true },
    }),
    prisma.buyerCandidate.groupBy({
      by: ["status"],
      where: { updatedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.aiFeedbackEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { engine: true, kind: true, confidence: true },
    }),
    prisma.autonomyRun.findMany({
      where: { startedAt: { gte: since }, finishedAt: { not: null } },
      select: { startedAt: true, finishedAt: true, steps: true },
      take: 100,
    }),
    prisma.autonomyDecision.findMany({
      where: { createdAt: { gte: since }, stage: "quality_gate" },
      select: { action: true, confidence: true },
    }),
  ]);

  // Merchandiser
  const merch = emptyCard("merchandiser");
  merch.decisions = merchDecisions.length;
  merch.approvals = merchDecisions.filter((d) =>
    ["accept", "queue", "publish", "compare_pick"].includes(d.decision)
  ).length;
  merch.rejections = merchDecisions.filter((d) =>
    ["reject", "dismiss", "delete"].includes(d.decision)
  ).length;
  merch.approvalRate = rate(merch.approvals, merch.decisions);
  merch.rejectionRate = rate(merch.rejections, merch.decisions);
  merch.hitRate = merch.approvalRate;

  // Digital Buyer
  const buyer = emptyCard("digital_buyer");
  const ranked = buyerCands.find((g) => g.status === "ranked")?._count._all || 0;
  const queued = buyerCands.find((g) => g.status === "queued")?._count._all || 0;
  const filtered = buyerCands.find((g) => g.status === "filtered")?._count._all || 0;
  const imported = buyerCands.find((g) => g.status === "imported")?._count._all || 0;
  buyer.decisions = ranked + queued + filtered + imported + buyerAlts.length;
  buyer.approvals = queued + imported + buyerAlts.filter((a) => a.status === "accepted").length;
  buyer.rejections =
    filtered + buyerAlts.filter((a) => a.status === "dismissed").length;
  buyer.approvalRate = rate(buyer.approvals, buyer.decisions || 1);
  buyer.rejectionRate = rate(buyer.rejections, buyer.decisions || 1);
  buyer.hitRate = rate(queued + imported, ranked + queued + imported || 1);
  const buyerConfs = buyerAlts
    .map((a) => a.confidence)
    .filter((c): c is number => c != null);
  buyer.avgConfidence = buyerConfs.length
    ? Math.round(buyerConfs.reduce((a, b) => a + b, 0) / buyerConfs.length)
    : null;

  // Store Intelligence
  const intel = emptyCard("store_intelligence");
  intel.decisions = catDecisions.length;
  intel.approvals = catDecisions.filter((d) =>
    d.decision.startsWith("accept")
  ).length;
  intel.rejections = catDecisions.filter((d) =>
    d.decision.startsWith("dismiss")
  ).length;
  intel.approvalRate = rate(intel.approvals, intel.decisions);
  intel.rejectionRate = rate(intel.rejections, intel.decisions);
  intel.hitRate = intel.approvalRate;

  // Autonomy
  const auto = emptyCard("autonomy");
  auto.decisions = autonomyDecisions.length;
  auto.approvals = autonomyDecisions.filter((d) =>
    ["accept", "queue", "process", "approve_review"].includes(d.action)
  ).length;
  auto.rejections = autonomyDecisions.filter((d) =>
    ["reject", "skip"].includes(d.action)
  ).length;
  auto.approvalRate = rate(auto.approvals, auto.decisions);
  auto.rejectionRate = rate(auto.rejections, auto.decisions);
  auto.hitRate = auto.approvalRate;
  if (autonomyDecisions.length) {
    auto.avgConfidence = Math.round(
      autonomyDecisions.reduce((a, d) => a + d.confidence, 0) /
        autonomyDecisions.length
    );
  }
  const durations = autonomyRuns
    .map((r) =>
      r.finishedAt && r.startedAt
        ? r.finishedAt.getTime() - r.startedAt.getTime()
        : null
    )
    .filter((n): n is number => n != null && n > 0);
  auto.avgProcessingMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  // Quality Gate
  const qg = emptyCard("quality_gate");
  qg.decisions = qgDecisions.length;
  qg.approvals = qgDecisions.filter((d) =>
    ["accept", "queue", "process"].includes(d.action)
  ).length;
  qg.rejections = qgDecisions.filter((d) => d.action === "reject").length;
  qg.approvalRate = rate(qg.approvals, qg.decisions);
  qg.rejectionRate = rate(qg.rejections, qg.decisions);
  qg.hitRate = qg.approvalRate;
  if (qgDecisions.length) {
    qg.avgConfidence = Math.round(
      qgDecisions.reduce((a, d) => a + d.confidence, 0) / qgDecisions.length
    );
  }

  // Pricing / SEO from feedback events
  const pricing = emptyCard("pricing");
  const seo = emptyCard("seo");
  const supplier = emptyCard("supplier");

  for (const f of feedback) {
    const card =
      f.engine === "pricing"
        ? pricing
        : f.engine === "seo"
          ? seo
          : f.engine === "supplier"
            ? supplier
            : null;
    if (!card) continue;
    card.decisions += 1;
    if (["approve", "publish", "queue"].includes(f.kind)) card.approvals += 1;
    if (["reject", "dismiss"].includes(f.kind)) card.rejections += 1;
  }

  for (const card of [pricing, seo, supplier]) {
    card.approvalRate = rate(card.approvals, card.decisions);
    card.rejectionRate = rate(card.rejections, card.decisions);
    card.hitRate = card.approvalRate;
    const confs = feedback
      .filter((f) => f.engine === card.engine && f.confidence != null)
      .map((f) => f.confidence as number);
    card.avgConfidence = confs.length
      ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length)
      : null;
  }

  // Supplier jobs as proxy for supplier engine throughput
  const jobs = await prisma.supplierJob.groupBy({
    by: ["status"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });
  const jobTotal = jobs.reduce((a, j) => a + j._count._all, 0);
  const jobOk = jobs.find((j) => j.status === "succeeded")?._count._all || 0;
  const jobFail =
    (jobs.find((j) => j.status === "failed")?._count._all || 0) +
    (jobs.find((j) => j.status === "dead")?._count._all || 0);
  supplier.decisions += jobTotal;
  supplier.approvals += jobOk;
  supplier.rejections += jobFail;
  supplier.approvalRate = rate(supplier.approvals, supplier.decisions);
  supplier.rejectionRate = rate(supplier.rejections, supplier.decisions);
  supplier.hitRate = supplier.approvalRate;

  return [supplier, merch, buyer, intel, pricing, seo, qg, auto];
}
