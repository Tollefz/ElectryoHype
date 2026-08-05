/**
 * RC: Buyer Worker lifecycle + stalled republish job check.
 */
import {
  getBuyerHuntWorkerStatus,
  tickBuyerHuntWorker,
} from "../lib/buyer/buyer-worker";
import {
  getBuyerPublishJob,
  resumeBuyerPublishJob,
  dismissBuyerPublishJob,
  PUBLISH_STALL_MS,
} from "../lib/buyer/publish-job";

async function main() {
  const before = await getBuyerHuntWorkerStatus();
  console.log(
    "WORKER_BEFORE",
    JSON.stringify(
      {
        status: before.status,
        lastTickAt: before.lastTickAt,
        tickAgeMs: before.lastTickAt
          ? Date.now() - new Date(before.lastTickAt).getTime()
          : null,
      },
      null,
      2
    )
  );

  // One forced tick (start-ish / heartbeat)
  try {
    await tickBuyerHuntWorker({ workerId: "rc-lifecycle" });
  } catch (e) {
    console.log("TICK_ERROR", e instanceof Error ? e.message : e);
  }
  const afterTick = await getBuyerHuntWorkerStatus();
  console.log(
    "WORKER_AFTER_TICK",
    JSON.stringify(
      { status: afterTick.status, lastTickAt: afterTick.lastTickAt },
      null,
      2
    )
  );

  for (const kind of ["republish", "publish"] as const) {
    const job = await getBuyerPublishJob(kind);
    if (!job) {
      console.log(`JOB_${kind}`, null);
      continue;
    }
    const tickAge = job.lastWorkerTickAt
      ? Date.now() - new Date(job.lastWorkerTickAt).getTime()
      : job.startedAt
        ? Date.now() - new Date(job.startedAt).getTime()
        : null;
    const stalled =
      job.status === "running" &&
      tickAge != null &&
      tickAge > PUBLISH_STALL_MS;
    console.log(
      `JOB_${kind}`,
      JSON.stringify(
        {
          status: job.status,
          total: job.total,
          published: job.published,
          skipped: job.skipped,
          failed: job.failed,
          busy: job.busy,
          stalled: job.stalled ?? stalled,
          tickAgeMs: tickAge,
          stallThresholdMs: PUBLISH_STALL_MS,
          stopReason: job.stopReason,
        },
        null,
        2
      )
    );

    if (stalled && kind === "republish") {
      console.log("STALLED_REPUBLISH — attempting resume");
      const resumed = await resumeBuyerPublishJob(kind);
      console.log("RESUME", {
        status: resumed?.status,
        stopReason: resumed?.stopReason,
      });
    }
  }

  console.log(
    "NOTE: stop = do not run worker loop; restart = npm run worker:buyer-hunt; dismiss stuck job via dismissBuyerPublishJob"
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
