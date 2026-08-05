/**
 * E2E publish verification — poll DB/settings until job completes or timeout.
 * Usage: npx ts-node ... scripts/_verify-publish-e2e.ts
 */
import { PrismaClient, ImportQueueStatus } from "@prisma/client";

const p = new PrismaClient();
const KEY = "buyer_publish_job";
const POLL_MS = 2500;
const MAX_MS = 45 * 60_000; // 45 min

type Job = {
  id?: string;
  requestId?: string;
  status?: string;
  candidateIds?: string[];
  cursor?: number;
  published?: number;
  failed?: number;
  skipped?: number;
  batchIndex?: number;
  batchSize?: number;
  startedAt?: string;
  updatedAt?: string;
  finishedAt?: string;
  lastPublishedProductName?: string;
  lastWorkerTickAt?: string;
  events?: Array<{ at: string; message: string }>;
  error?: string | null;
  stopReason?: string | null;
};

function asJob(v: unknown): Job | null {
  if (!v || typeof v !== "object") return null;
  return v as Job;
}

async function countProducts() {
  const [active, publishedQ, createdSince] = await Promise.all([
    p.product.count({ where: { isActive: true } }),
    p.importQueueItem.count({ where: { status: ImportQueueStatus.published } }),
    p.product.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
    }),
  ]);
  return { active, publishedQ, created24h: createdSince };
}

async function workerPulse() {
  const row = await p.setting.findUnique({ where: { key: "buyer_hunt_worker" } });
  const v = (row?.value || {}) as Record<string, unknown>;
  return {
    lastTickAt: typeof v.lastTickAt === "string" ? v.lastTickAt : null,
    lastException: v.lastException || null,
  };
}

function log(step: string, msg: string, extra?: unknown) {
  const ts = new Date().toISOString();
  const suffix = extra !== undefined ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[${ts}] [${step}] ${msg}${suffix}`);
}

async function main() {
  const started = Date.now();
  const before = await countProducts();
  log("BASELINE", "Products before", before);

  let jobSeen: Job | null = null;
  let firstFailStep: string | null = null;
  let lastCursor = -1;
  let lastPublished = -1;
  let batchesSeen = new Set<number>();
  let phase:
    | "waiting_click"
    | "api_db"
    | "worker"
    | "publishing"
    | "done"
    | "failed" = "waiting_click";

  log(
    "WAIT",
    "Waiting for buyer_publish_job (click Publiser valgte now)…"
  );

  while (Date.now() - started < MAX_MS) {
    const row = await p.setting.findUnique({ where: { key: KEY } });
    const job = asJob(row?.value);
    const products = await countProducts();
    const worker = await workerPulse();

    if (!job?.id) {
      if (phase !== "waiting_click") {
        // Job disappeared unexpectedly
        if (!firstFailStep) firstFailStep = "DB (job missing after create)";
        phase = "failed";
        log("FAIL", "buyer_publish_job is null after it existed", {
          products,
          worker,
        });
        break;
      }
      await sleep(POLL_MS);
      continue;
    }

    if (!jobSeen) {
      jobSeen = job;
      phase = "api_db";
      log("API/DB", "Publish job created", {
        jobId: job.id,
        requestId: job.requestId || null,
        status: job.status,
        candidates: job.candidateIds?.length ?? 0,
        startedAt: job.startedAt,
        batchSize: job.batchSize,
      });
      if (job.status !== "running" && job.status !== "done" && job.status !== "error") {
        firstFailStep = "DB (unexpected status)";
      }
      phase = "worker";
    }

    const cursor = job.cursor ?? 0;
    const published = job.published ?? 0;
    const batchIndex = job.batchIndex ?? 0;

    if (batchIndex > 0 && !batchesSeen.has(batchIndex)) {
      batchesSeen.add(batchIndex);
      log("WORKER", `Batch ${batchIndex} completed`, {
        cursor,
        published,
        failed: job.failed,
        skipped: job.skipped,
        lastProduct: job.lastPublishedProductName || null,
        workerTick: worker.lastTickAt,
      });
    }

    if (cursor > lastCursor || published > lastPublished) {
      phase = "publishing";
      lastCursor = cursor;
      lastPublished = published;
      const total = job.candidateIds?.length ?? 0;
      log("PUBLISH", "Progress", {
        processed: cursor,
        total,
        published,
        failed: job.failed,
        skipped: job.skipped,
        productsNow: products.active,
        productsDelta: products.active - before.active,
        lastProduct: job.lastPublishedProductName || null,
        lastHeartbeat: job.lastWorkerTickAt || job.updatedAt,
      });
    }

    if (job.status === "error") {
      firstFailStep = firstFailStep || "Batch (supplier/API stop)";
      phase = "failed";
      log("FAIL", "Job status=error", {
        stopReason: job.stopReason,
        error: job.error,
        cursor,
        published,
      });
      break;
    }

    if (job.status === "done") {
      phase = "done";
      const after = await countProducts();
      const elapsedSec = job.startedAt
        ? Math.round(
            (new Date(job.finishedAt || Date.now()).getTime() -
              new Date(job.startedAt).getTime()) /
              1000
          )
        : null;
      log("DONE", "Publish job finished", {
        jobId: job.id,
        published: job.published,
        skipped: job.skipped,
        failed: job.failed,
        elapsedSec,
        productsBefore: before.active,
        productsAfter: after.active,
        publishedQueue: after.publishedQ,
        batches: [...batchesSeen].sort((a, b) => a - b),
        events: (job.events || []).slice(-12).map((e) => e.message),
      });
      break;
    }

    // Stall detection: job running but no progress for 3 min after first sight
    if (
      job.status === "running" &&
      jobSeen &&
      Date.now() - new Date(job.updatedAt || job.startedAt || 0).getTime() >
        180_000 &&
      cursor === 0 &&
      published === 0
    ) {
      firstFailStep = firstFailStep || "Worker (no batch claimed / no progress)";
      log("WARN", "No progress for 3+ min — worker may not be draining", {
        workerTick: worker.lastTickAt,
        lastException: worker.lastException,
      });
    }

    await sleep(POLL_MS);
  }

  if (phase === "waiting_click") {
    firstFailStep = "Klikk (ingen jobb innen timeout — ble Publiser valgte trykket?)";
    log("TIMEOUT", "No publish job appeared", { waitedMs: Date.now() - started });
  }

  const finalProducts = await countProducts();
  const finalJob = asJob(
    (await p.setting.findUnique({ where: { key: KEY } }))?.value
  );
  const worker = await workerPulse();

  console.log("\n========== E2E PUBLISH REPORT ==========");
  console.log(
    JSON.stringify(
      {
        phase,
        firstFailStep,
        baseline: before,
        final: finalProducts,
        deltaProducts: finalProducts.active - before.active,
        job: finalJob
          ? {
              jobId: finalJob.id,
              requestId: finalJob.requestId,
              status: finalJob.status,
              candidates: finalJob.candidateIds?.length,
              cursor: finalJob.cursor,
              published: finalJob.published,
              skipped: finalJob.skipped,
              failed: finalJob.failed,
              batchIndex: finalJob.batchIndex,
              lastProduct: finalJob.lastPublishedProductName,
              stopReason: finalJob.stopReason,
              startedAt: finalJob.startedAt,
              finishedAt: finalJob.finishedAt,
            }
          : null,
        worker,
        batchesSeen: [...batchesSeen].sort((a, b) => a - b),
        flow: [
          "Klikk",
          "API",
          "DB",
          "Worker",
          "Batch",
          "Produkt",
          "UI",
        ].map((step) => ({
          step,
          ok:
            firstFailStep == null
              ? phase === "done"
              : !String(firstFailStep).startsWith(step.split(" ")[0]!),
        })),
      },
      null,
      2
    )
  );

  await p.$disconnect();
  process.exit(phase === "done" ? 0 : 1);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
