/**
 * Performance problems only — hide healthy noise.
 */

import "server-only";

import { prisma } from "@/lib/prisma";

export async function getPerformanceProblems(): Promise<
  Array<{ id: string; label: string; detail: string }>
> {
  const since1h = new Date(Date.now() - 60 * 60 * 1000);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const problems: Array<{ id: string; label: string; detail: string }> = [];

  const [deadJobs, failedJobs, lockedStuck, apiErrors, failedImports] =
    await Promise.all([
      prisma.supplierJob.count({
        where: { status: "dead", deadAt: { gte: since24h } },
      }),
      prisma.supplierJob.count({
        where: { status: "failed", updatedAt: { gte: since24h } },
      }),
      prisma.supplierJob.count({
        where: {
          status: { in: ["locked", "running"] },
          lockExpiresAt: { lt: new Date() },
        },
      }),
      prisma.supplierApiLog.count({
        where: { ok: false, createdAt: { gte: since24h } },
      }),
      prisma.importQueueItem.count({
        where: { status: "failed", updatedAt: { gte: since24h } },
      }),
    ]);

  if (deadJobs > 0) {
    problems.push({
      id: "dead_jobs",
      label: "Workers i dead-letter",
      detail: `${deadJobs} jobb(er) siste 24t — sjekk Workers`,
    });
  }
  if (failedJobs >= 5) {
    problems.push({
      id: "failed_jobs",
      label: "Mange feilede worker-jobber",
      detail: `${failedJobs} feilet siste 24t`,
    });
  }
  if (lockedStuck > 0) {
    problems.push({
      id: "stuck_locks",
      label: "Låste jobber som har utløpt",
      detail: `${lockedStuck} stuck lock(s)`,
    });
  }
  if (apiErrors >= 10) {
    problems.push({
      id: "api_errors",
      label: "Leverandør-API-feil",
      detail: `${apiErrors} feil siste 24t`,
    });
  }
  if (failedImports > 0) {
    problems.push({
      id: "failed_imports",
      label: "Feilede importer",
      detail: `${failedImports} i Importkø`,
    });
  }

  // Slow autonomy runs (>10 min)
  const slow = await prisma.autonomyRun.findFirst({
    where: {
      finishedAt: { gte: since1h },
      status: "completed",
    },
    orderBy: { finishedAt: "desc" },
    select: { startedAt: true, finishedAt: true },
  });
  if (slow?.finishedAt && slow.startedAt) {
    const ms = slow.finishedAt.getTime() - slow.startedAt.getTime();
    if (ms > 10 * 60_000) {
      problems.push({
        id: "slow_autonomy",
        label: "Treg Autonomy-syklus",
        detail: `${Math.round(ms / 60000)} min siste kjøring`,
      });
    }
  }

  return problems;
}
