/**
 * RC: dry-run all board-ready candidates through live economics + Quality Gate.
 * Does NOT publish. Writes progress JSON to tmp.
 *
 * Usage: ... scripts/_rc-dry-run-ready.ts [limit]
 */
import * as fs from "fs";
import * as path from "path";
import { getRepublishBoard } from "../lib/buyer/republish";
import { approveAndPublishCandidates } from "../lib/buyer/approve-and-publish";

const OUT = path.join(process.cwd(), "tmp-rc-dry-run.json");
const CHUNK = 10;

async function main() {
  const limitArg = Number(process.argv[2] || 0);
  const board = await getRepublishBoard({ status: "ready", limit: 1 });
  const s = board.summary;
  const sum = s.ready + s.failGate + s.published;
  console.log(
    "BOARD",
    JSON.stringify({
      total: s.total,
      ready: s.ready,
      failGate: s.failGate,
      published: s.published,
      sum,
      invariantOk: sum === s.total,
      gateReasons: s.gateReasons,
    })
  );
  if (sum !== s.total) {
    throw new Error("Board invariant broken — abort dry-run");
  }

  const ids = board.readyIds.slice(
    0,
    limitArg > 0 ? limitArg : board.readyIds.length
  );
  console.log(`Dry-run ${ids.length} of ${board.readyIds.length} ready`);

  const buckets: Record<string, number> = {};
  let wouldPublish = 0;
  let wouldStop = 0;
  const stopped: { id: string; reason: string }[] = [];
  const t0 = Date.now();

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const result = await approveAndPublishCandidates({
      ids: chunk,
      dryRun: true,
      limit: chunk.length,
    });
    for (const o of result.outcomes) {
      if (o.status === "would_publish") {
        wouldPublish += 1;
        buckets.would_publish = (buckets.would_publish || 0) + 1;
      } else {
        wouldStop += 1;
        const reason = (o.problems[0] || o.message || "other").slice(0, 100);
        buckets[reason] = (buckets[reason] || 0) + 1;
        if (stopped.length < 50) {
          stopped.push({ id: o.candidateId, reason });
        }
      }
    }
    const done = Math.min(ids.length, i + CHUNK);
    const elapsed = (Date.now() - t0) / 1000;
    const ppm = done > 0 ? (done / elapsed) * 60 : 0;
    const report = {
      at: new Date().toISOString(),
      sampled: done,
      total: ids.length,
      boardReady: board.readyIds.length,
      wouldPublish,
      wouldStop,
      rateWouldPublish:
        done > 0 ? Math.round((wouldPublish / done) * 1000) / 10 : 0,
      buckets,
      stoppedSample: stopped,
      elapsedSec: Math.round(elapsed),
      ppm: Math.round(ppm * 10) / 10,
    };
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(
      `progress ${done}/${ids.length} would=${wouldPublish} stop=${wouldStop} ppm=${report.ppm}`
    );
  }

  const final = JSON.parse(fs.readFileSync(OUT, "utf8"));
  console.log("FINAL", JSON.stringify(final, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
