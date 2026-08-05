/**
 * Drain + monitor republish job until done/error.
 * Stops on unexpected failed spike or recoverable pause.
 * Usage: ... scripts/_monitor-alt-a.ts
 */
import * as fs from "fs";
import * as path from "path";
import {
  getBuyerPublishJob,
  tickBuyerPublishJob,
  dismissBuyerPublishJob,
} from "../lib/buyer/publish-job";
import { getBuyerHuntWorkerStatus } from "../lib/buyer/buyer-worker";

const OUT = path.join(process.cwd(), "tmp-alt-a-progress.json");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const t0 = Date.now();
  let lastPublished = -1;
  let stallRounds = 0;
  let consecutiveUnexpected = 0;

  while (true) {
    let job = await getBuyerPublishJob("republish");
    if (!job) {
      console.log("NO_JOB");
      process.exit(1);
    }

    if (job.status === "running" && !job.busy) {
      try {
        job =
          (await tickBuyerPublishJob({
            kind: "republish",
            workerId: "alt-a-monitor",
            batchSize: job.batchSize || 10,
          })) || job;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("TICK_ERROR", msg);
        fs.writeFileSync(
          OUT,
          JSON.stringify(
            {
              at: new Date().toISOString(),
              fatal: true,
              error: msg,
              job,
            },
            null,
            2
          )
        );
        process.exit(2);
      }
    }

    job = (await getBuyerPublishJob("republish")) || job;
    const w = await getBuyerHuntWorkerStatus();
    const processed = job.published + job.skipped + job.failed;
    const remaining = Math.max(0, job.total - (job.cursor || processed));
    const elapsedMin = Math.round(((Date.now() - t0) / 60_000) * 10) / 10;
    const ppm =
      elapsedMin > 0
        ? Math.round((processed / elapsedMin) * 10) / 10
        : null;

    const snap = {
      at: new Date().toISOString(),
      status: job.status,
      total: job.total,
      cursor: job.cursor,
      published: job.published,
      skipped: job.skipped,
      failed: job.failed,
      processed,
      remaining,
      elapsedMin,
      ppm,
      stopReason: job.stopReason,
      lastError: job.error,
      reasonCounts: (job as { reasonCounts?: Record<string, number> })
        .reasonCounts,
      workerStatus: w.status,
      busy: job.busy,
      stalled: job.stalled,
    };
    fs.writeFileSync(OUT, JSON.stringify(snap, null, 2));
    console.log(
      `progress pub=${job.published} skip=${job.skipped} fail=${job.failed} cursor=${job.cursor}/${job.total} status=${job.status} ppm=${ppm}`
    );

    // Unexpected: any hard failures that aren't supplier pause
    if (job.failed > 0) {
      consecutiveUnexpected += 1;
      // Allow small transient fails; abort if failed climbs without publish progress
      if (job.failed >= 10 && job.failed > job.published * 0.15) {
        console.error("ABORT unexpected failure rate", snap);
        await dismissBuyerPublishJob("republish").catch(() => undefined);
        process.exit(3);
      }
    } else {
      consecutiveUnexpected = 0;
    }

    if (job.status === "error") {
      // Recoverable CJ pause — try resume via continue ticking after wait
      console.warn("JOB_PAUSED", job.stopReason, job.stopDetail || job.error);
      if (
        /api|cj|rate|points|network|auth/i.test(
          `${job.stopReason || ""} ${job.error || ""}`
        )
      ) {
        await sleep(30_000);
        // resumeBuyerPublishJob clears error — import dynamically
        const { resumeBuyerPublishJob } = await import(
          "../lib/buyer/publish-job"
        );
        await resumeBuyerPublishJob("republish");
        continue;
      }
      console.error("ABORT non-recoverable error", snap);
      process.exit(4);
    }

    if (job.status === "done") {
      console.log("DONE", JSON.stringify(snap, null, 2));
      process.exit(0);
    }

    if (job.published === lastPublished) {
      stallRounds += 1;
    } else {
      stallRounds = 0;
      lastPublished = job.published;
    }
    // Soft stall warning only — ticks may skip-only for a while
    if (stallRounds > 40) {
      console.warn("WARN long skip-only stretch", snap);
      stallRounds = 0;
    }

    await sleep(2_000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
