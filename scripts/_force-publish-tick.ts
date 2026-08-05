/**
 * Force one publish tick and print result / error.
 */
import { tickBuyerPublishJob, getBuyerPublishJob } from "../lib/buyer/publish-job";

async function main() {
  console.log("BEFORE", await getBuyerPublishJob().then((j) => ({
    id: j?.id,
    status: j?.status,
    cursor: j?.cursor,
    published: j?.published,
    busy: j?.busy,
    stalled: j?.stalled,
    events: j?.events?.slice(-3),
  })));

  console.log("TICKING…");
  const t0 = Date.now();
  try {
    const after = await tickBuyerPublishJob({ workerId: "e2e-verify" });
    console.log("AFTER", {
      ms: Date.now() - t0,
      id: after?.id,
      status: after?.status,
      cursor: after?.cursor,
      published: after?.published,
      failed: after?.failed,
      skipped: after?.skipped,
      lastProduct: after?.lastPublishedProductName,
      stopReason: after?.stopReason,
      events: after?.events?.slice(-5),
    });
  } catch (e) {
    console.error("TICK_ERROR", e);
  }
  process.exit(0);
}

main();
