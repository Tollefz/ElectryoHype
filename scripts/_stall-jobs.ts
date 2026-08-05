import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const allJobs = await prisma.supplierJob.findMany({
    where: {
      createdAt: { gte: since24h },
      type: "buyer_scan_batch",
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      attempts: true,
      lastError: true,
      progressMessage: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      runAfter: true,
      updatedAt: true,
      idempotencyKey: true,
      payload: true,
    },
  });

  const pending = await prisma.supplierJob.findMany({
    where: { type: "buyer_scan_batch", status: { in: ["pending", "failed", "running"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      attempts: true,
      lastError: true,
      progressMessage: true,
      createdAt: true,
      runAfter: true,
      startedAt: true,
      lockedBy: true,
      lockExpiresAt: true,
      idempotencyKey: true,
    },
  });

  const gaps = [];
  for (let i = 0; i < allJobs.length; i++) {
    const j = allJobs[i];
    const waitSec =
      j.startedAt && j.createdAt
        ? Math.round((j.startedAt.getTime() - j.createdAt.getTime()) / 1000)
        : null;
    const runSec =
      j.startedAt && j.finishedAt
        ? Math.round((j.finishedAt.getTime() - j.startedAt.getTime()) / 1000)
        : null;
    const gapFromPrev =
      i > 0 && allJobs[i - 1].finishedAt
        ? Math.round(
            (j.createdAt.getTime() - allJobs[i - 1].finishedAt!.getTime()) / 1000
          )
        : null;
    gaps.push({
      key: j.idempotencyKey,
      status: j.status,
      createdAt: j.createdAt.toISOString(),
      startedAt: j.startedAt?.toISOString() || null,
      finishedAt: j.finishedAt?.toISOString() || null,
      waitSec,
      runSec,
      gapFromPrevFinishToCreateSec: gapFromPrev,
      attempts: j.attempts,
      lastError: j.lastError,
      progressMessage: j.progressMessage,
    });
  }

  // scanned progression from idempotency keys
  const scannedMarks = allJobs.map((j) => {
    const m = String(j.idempotencyKey || "").match(/:(\d+)$/);
    return {
      at: (j.finishedAt || j.startedAt || j.createdAt).toISOString(),
      scannedMark: m ? Number(m[1]) : null,
      status: j.status,
    };
  });

  console.log(
    JSON.stringify(
      {
        now: now.toISOString(),
        jobs24h: allJobs.length,
        gaps,
        pendingOpen: pending,
        scannedMarks,
      },
      null,
      2
    )
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
