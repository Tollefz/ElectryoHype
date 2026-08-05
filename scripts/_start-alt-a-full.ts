/**
 * Alternative A: start republish of ALL board-ready candidates.
 * Usage: ... scripts/_start-alt-a-full.ts
 */
import {
  dismissBuyerPublishJob,
  getBuyerPublishJob,
} from "../lib/buyer/publish-job";
import {
  getRepublishBoard,
  startBuyerRepublishJob,
} from "../lib/buyer/republish";

async function main() {
  const existing = await getBuyerPublishJob("republish");
  if (existing?.status === "running") {
    console.log("Already running", {
      total: existing.total,
      published: existing.published,
      cursor: existing.cursor,
    });
    process.exit(0);
  }
  if (existing?.status === "done" || existing?.status === "error") {
    await dismissBuyerPublishJob("republish");
  }

  const board = await getRepublishBoard({ status: "ready", limit: 1 });
  const ids = board.readyIds;
  console.log(
    "STARTING_ALT_A",
    JSON.stringify(
      {
        ready: ids.length,
        failGate: board.summary.failGate,
        published: board.summary.published,
        total: board.summary.total,
      },
      null,
      2
    )
  );
  if (!ids.length) throw new Error("No ready candidates");

  const started = await startBuyerRepublishJob({
    ids,
    fillMissingPricing: false,
    batchSize: 10,
    actorEmail: "alt-a@local",
  });

  console.log(
    "JOB_STARTED",
    JSON.stringify(
      {
        status: started.job.status,
        total: started.job.total,
        selected: started.selected,
        batchSize: started.job.batchSize,
        id: started.job.id,
      },
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
