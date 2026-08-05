/**
 * Sample live economic revalidate on ready candidates (dry-run approve).
 * Usage: ... scripts/_sample-live-ready.ts [count]
 */
import { getRepublishBoard } from "../lib/buyer/republish";
import { approveAndPublishCandidates } from "../lib/buyer/approve-and-publish";

async function main() {
  const n = Math.max(5, Math.min(40, Number(process.argv[2] || 20)));
  const board = await getRepublishBoard({ status: "ready", limit: 1 });
  const ids = board.readyIds.slice(0, n);
  console.log("Sampling", ids.length, "of", board.summary.ready, "ready");

  const buckets: Record<string, number> = {};
  let wouldPublish = 0;
  let needControl = 0;

  // Batch in chunks of 5 to avoid hammering
  for (let i = 0; i < ids.length; i += 5) {
    const chunk = ids.slice(i, i + 5);
    const result = await approveAndPublishCandidates({
      ids: chunk,
      dryRun: true,
      limit: chunk.length,
    });
    for (const o of result.outcomes) {
      if (o.status === "would_publish") {
        wouldPublish += 1;
        buckets.publish = (buckets.publish || 0) + 1;
      } else {
        needControl += 1;
        const key = (o.problems[0] || o.message || "other").slice(0, 80);
        buckets[key] = (buckets[key] || 0) + 1;
      }
    }
    console.log(`chunk ${i / 5 + 1}: published=${wouldPublish} control=${needControl}`);
  }

  console.log(
    JSON.stringify(
      {
        sampled: ids.length,
        wouldPublish,
        needControl,
        rateWouldPublish:
          ids.length > 0
            ? Math.round((wouldPublish / ids.length) * 1000) / 10
            : 0,
        buckets,
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
