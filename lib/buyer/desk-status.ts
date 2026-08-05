/**
 * Compact Digital Buyer status for Rob's Desk / dashboard.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { ImportQueueStatus } from "@prisma/client";
import { resolveBuyerRankingScanId } from "@/lib/buyer/scan";
import { getBuyerHuntWorkerStatus } from "@/lib/buyer/buyer-worker";
import { getBuyerPublishJob } from "@/lib/buyer/publish-job";
import {
  formatFriendlySupplierError,
  isApiPointsExhausted,
  type FriendlySupplierError,
} from "@/lib/buyer/cj-errors";
import type { BuyerPublishJobSnapshot } from "@/lib/buyer/publish-job-types";

export type DeskBuyerPhase =
  | "scanning"
  | "learning"
  | "candidates"
  | "importing"
  | "publishing"
  | "waiting_api"
  | "idle"
  | "done"
  | "stopped";

export type DigitalBuyerDeskStatus = {
  trafficLight: "running" | "waiting_api" | "stopped" | "idle";
  phase: DeskBuyerPhase;
  phaseSteps: Array<{
    id: string;
    label: string;
    state: "done" | "active" | "pending";
  }>;
  scanned: number;
  candidates: number;
  imported: number;
  published: number;
  productsPerMin: number | null;
  etaMinutes: number | null;
  nextStep: string;
  scanStatus: string | null;
  workerStatus: "running" | "idle" | "stopped";
  apiIssue: FriendlySupplierError | null;
  publishJob: BuyerPublishJobSnapshot | null;
  scanRunId: string | null;
  targetScanCount: number | null;
  workerHeartbeat: string | null;
};

export async function getDigitalBuyerDeskStatus(): Promise<DigitalBuyerDeskStatus> {
  const [scanId, worker, publishJob] = await Promise.all([
    resolveBuyerRankingScanId(),
    getBuyerHuntWorkerStatus(),
    getBuyerPublishJob(),
  ]);

  const scan = scanId
    ? await prisma.buyerScanRun.findUnique({
        where: { id: scanId },
        select: {
          id: true,
          status: true,
          scanned: true,
          kept: true,
          filtered: true,
          targetScanCount: true,
          error: true,
        },
      })
    : await prisma.buyerScanRun.findFirst({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          scanned: true,
          kept: true,
          filtered: true,
          targetScanCount: true,
          error: true,
        },
      });

  const scanRunId = scan?.id ?? null;

  const [candidates, importedCand, publishedQ, importingQ] = await Promise.all([
    scanRunId
      ? prisma.buyerCandidate.count({
          where: {
            scanRunId,
            status: "ranked",
            isBestInGroup: true,
          },
        })
      : prisma.buyerCandidate.count({
          where: { status: "ranked", isBestInGroup: true },
        }),
    prisma.buyerCandidate.count({
      where: {
        status: { in: ["queued", "imported"] },
        ...(scanRunId ? { scanRunId } : {}),
      },
    }),
    prisma.importQueueItem.count({
      where: { status: ImportQueueStatus.published },
    }),
    prisma.importQueueItem.count({
      where: {
        status: {
          in: [
            ImportQueueStatus.queued,
            ImportQueueStatus.processing,
            ImportQueueStatus.validating,
            ImportQueueStatus.normalizing,
            ImportQueueStatus.enriching,
            ImportQueueStatus.quality_check,
            ImportQueueStatus.preview,
            ImportQueueStatus.ai,
            ImportQueueStatus.review,
            ImportQueueStatus.approved,
          ],
        },
      },
    }),
  ]);

  const apiIssue = formatFriendlySupplierError(scan?.error);
  const pointsOut = isApiPointsExhausted(scan?.error);
  const huntLive =
    scan?.status === "running" || scan?.status === "queued";
  const publishLive = publishJob?.status === "running";

  let trafficLight: DigitalBuyerDeskStatus["trafficLight"] = "idle";
  if (pointsOut) {
    trafficLight = "waiting_api";
  } else if (worker.status === "stopped" && (huntLive || worker.pendingJobs > 0)) {
    trafficLight = "stopped";
  } else if (huntLive || publishLive || worker.status === "running") {
    trafficLight = "running";
  } else if (worker.status === "stopped") {
    trafficLight = "stopped";
  }

  let phase: DeskBuyerPhase = "idle";
  if (pointsOut) phase = "waiting_api";
  else if (publishLive) phase = "publishing";
  else if (importingQ > 0) phase = "importing";
  else if (huntLive && (scan?.scanned || 0) > 0) phase = "scanning";
  else if (huntLive) phase = "learning";
  else if (candidates > 0 && trafficLight === "idle") phase = "candidates";
  else if (scan?.status === "completed" || scan?.status === "failed") {
    phase = candidates > 0 ? "candidates" : "done";
  }
  if (trafficLight === "stopped" && !pointsOut) phase = "stopped";

  const phaseSteps = buildPhaseSteps(phase, {
    scanned: scan?.scanned || 0,
    candidates,
    importing: importingQ,
    publishing: publishLive,
  });

  let nextStep = "Ingen handling nå";
  if (pointsOut) {
    nextStep = "Venter på nye CJ API-poeng";
  } else if (publishLive) {
    nextStep = "Publisering pågår";
  } else if (candidates > 0) {
    nextStep = "Importer / publiser produkter";
  } else if (huntLive) {
    nextStep = "AI analyserer — følg med";
  } else if (trafficLight === "stopped") {
    nextStep = "Start worker (npm run worker:buyer-hunt)";
  } else {
    nextStep = "Start produktjakt";
  }

  const target = scan?.targetScanCount || null;
  const remaining =
    target != null && scan ? Math.max(0, target - scan.scanned) : null;
  const ppm = worker.productsPerMin ?? publishJob?.productsPerMin ?? null;
  const etaMinutes =
    ppm && ppm > 0 && remaining != null
      ? Math.round(remaining / ppm)
      : publishJob?.etaSeconds != null
        ? Math.round(publishJob.etaSeconds / 60)
        : null;

  return {
    trafficLight,
    phase,
    phaseSteps,
    scanned: scan?.scanned ?? 0,
    candidates,
    imported: importedCand,
    published: publishedQ,
    productsPerMin: ppm,
    etaMinutes,
    nextStep,
    scanStatus: scan?.status ?? null,
    workerStatus: worker.status,
    apiIssue,
    publishJob,
    scanRunId,
    targetScanCount: target,
    workerHeartbeat: worker.lastTickAt,
  };
}

function buildPhaseSteps(
  phase: DeskBuyerPhase,
  ctx: {
    scanned: number;
    candidates: number;
    importing: number;
    publishing: boolean;
  }
): DigitalBuyerDeskStatus["phaseSteps"] {
  const order: Array<{ id: string; label: string; key: DeskBuyerPhase | "scan" }> = [
    { id: "scan", label: "Discovery", key: "scanning" },
    { id: "learn", label: "Analyse", key: "learning" },
    { id: "cand", label: "Kandidater", key: "candidates" },
    { id: "pub", label: "Publisering", key: "publishing" },
    { id: "imp", label: "Importer", key: "importing" },
    { id: "done", label: "Ferdig", key: "done" },
  ];

  const activeIdx = (() => {
    if (phase === "waiting_api" || phase === "stopped") {
      return ctx.scanned > 0 ? 0 : -1;
    }
    if (ctx.publishing || phase === "publishing") return 3;
    if (phase === "scanning" || phase === "learning") return 0;
    if (phase === "candidates") return 2;
    if (phase === "importing") return 4;
    if (phase === "done") return 5;
    if (ctx.candidates > 0) return 2;
    if (ctx.scanned > 0) return 0;
    return -1;
  })();

  return order.map((step, i) => {
    let state: "done" | "active" | "pending" = "pending";
    if (activeIdx < 0) {
      state = "pending";
    } else if (i < activeIdx) state = "done";
    else if (i === activeIdx) state = "active";
    if (phase === "done" && i <= 5) state = i < 5 ? "done" : "active";
    if (ctx.publishing && step.id === "pub") state = "active";
    return { id: step.id, label: step.label, state };
  });
}
