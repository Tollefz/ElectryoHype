/**
 * Start republish of N ready candidates (default 1).
 * Usage: ... scripts/_start-republish-n.ts [n]
 */
import { getBuyerHuntWorkerStatus } from "../lib/buyer/buyer-worker";
import {
  getBuyerRepublishJob,
  getRepublishBoard,
  startBuyerRepublishJob,
} from "../lib/buyer/republish";

async function main() {
  const n = Math.max(1, Math.min(500, Number(process.argv[2] || 1)));
  const w = await getBuyerHuntWorkerStatus();
  console.log(
    "WORKER",
    JSON.stringify(
      {
        status: w.status,
        lastTickAt: w.lastTickAt,
        lastException:
          typeof w.lastException === "string"
            ? w.lastException.slice(0, 300)
            : w.lastException,
      },
      null,
      2
    )
  );

  const existing = await getBuyerRepublishJob();
  console.log(
    "EXISTING_JOB",
    existing
      ? {
          status: existing.status,
          done: existing.done,
          total: existing.total,
          failed: existing.failed,
          skipped: existing.skipped,
        }
      : null
  );

  if (existing?.status === "running") {
    console.log("ALREADY_RUNNING — not starting another job");
    process.exit(0);
  }

  const board = await getRepublishBoard({ status: "ready", limit: 1 });
  const ids = board.readyIds.slice(0, n);
  console.log(
    "SELECT",
    JSON.stringify(
      {
        n,
        selected: ids.length,
        sample: ids.slice(0, 3),
        titles: board.rows
          .filter((r) => ids.includes(r.id))
          .map((r) => r.title)
          .slice(0, 3),
      },
      null,
      2
    )
  );

  if (!ids.length) {
    throw new Error("No ready candidates");
  }

  const started = await startBuyerRepublishJob({
    ids,
    fillMissingPricing: false,
    batchSize: Math.min(10, ids.length),
    actorEmail: "diag@local",
  });

  console.log(
    "STARTED",
    JSON.stringify(
      {
        status: started.job.status,
        total: started.job.total,
        selected: started.selected,
        kind: started.job.kind,
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
