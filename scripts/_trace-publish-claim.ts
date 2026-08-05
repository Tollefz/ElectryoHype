/**
 * Trace why worker would skip publish drain — exact branch, no guessing.
 */
import { PrismaClient } from "@prisma/client";
import { getBuyerPublishJob, tickBuyerPublishJob } from "../lib/buyer/publish-job";
import { getBuyerHuntWorkerStatus } from "../lib/buyer/buyer-worker";

const p = new PrismaClient();

async function main() {
  console.log("=== 1. Raw Setting buyer_publish_job ===");
  const row = await p.setting.findUnique({ where: { key: "buyer_publish_job" } });
  if (!row) {
    console.log("BRANCH: setting row MISSING → getBuyerPublishJob() returns null");
    console.log("  → if (pub?.status === 'running' && !pub.busy) is FALSE");
    console.log("  → worker skips publish drain, continues to hunt SupplierJob claim");
    await p.$disconnect();
    return;
  }
  const raw = row.value as Record<string, unknown>;
  console.log({
    id: raw.id,
    status: raw.status,
    cursor: raw.cursor,
    batchIndex: raw.batchIndex,
    lockedUntil: raw.lockedUntil,
    lastWorkerTickAt: raw.lastWorkerTickAt,
    updatedAt: raw.updatedAt,
    candidateCount: Array.isArray(raw.candidateIds)
      ? raw.candidateIds.length
      : 0,
  });

  console.log("\n=== 2. getBuyerPublishJob() snapshot (what worker sees) ===");
  const pub = await getBuyerPublishJob();
  console.log({
    found: Boolean(pub),
    id: pub?.id,
    status: pub?.status,
    busy: pub?.busy,
    stalled: pub?.stalled,
    cursor: pub?.cursor,
    currentBatch: pub?.currentBatch,
    totalBatches: pub?.totalBatches,
    inProgress: pub?.inProgress,
    lockedImpliesBusy: pub?.busy,
  });

  console.log("\n=== 3. Exact gate in tickBuyerHuntWorker ===");
  console.log(
    "Code: if (pub?.status === 'running' && !pub.busy) { drain } else { skip }"
  );
  const statusOk = pub?.status === "running";
  const notBusy = pub ? !pub.busy : false;
  const willDrain = Boolean(pub && statusOk && notBusy);
  console.log({
    "pub exists": Boolean(pub),
    "pub.status === 'running'": statusOk,
    "!pub.busy": notBusy,
    WILL_DRAIN: willDrain,
  });

  if (!pub) {
    console.log("SKIP REASON: pub is null (no job / asJob parse failed)");
  } else if (!statusOk) {
    console.log(`SKIP REASON: status is '${pub.status}' (not running)`);
  } else if (!notBusy) {
    console.log(
      "SKIP REASON: pub.busy === true (lockedUntil still in the future)"
    );
    console.log(
      "  busy = status===running && lockedUntil && Date(lockedUntil) > now"
    );
  } else {
    console.log("GATE OPEN → worker should call tickBuyerPublishJob()");
  }

  console.log("\n=== 4. Hunt SupplierJob claim (SEPARATE path — NOT publish) ===");
  console.log(
    "runSupplierWorkers({ types: [buyer_scan_batch] }) — publish has NO SQL claim"
  );
  const pendingHunt = await p.supplierJob.count({
    where: { type: "buyer_scan_batch", status: "pending" },
  });
  // Schema uses locked/running — there is no "claimed" status
  const inFlightHunt = await p.supplierJob.count({
    where: {
      type: "buyer_scan_batch",
      status: { in: ["locked", "running"] },
    },
  });
  console.log({
    pending_buyer_scan_batch: pendingHunt,
    locked_or_running_buyer_scan_batch: inFlightHunt,
    note: "Heartbeat status=idle means NO hunt SupplierJobs — publish can still run",
  });

  console.log("\n=== 5. Worker metrics status derivation ===");
  const metrics = await getBuyerHuntWorkerStatus();
  console.log({
    status: metrics.status,
    pendingJobs: metrics.pendingJobs,
    claimedJobs: metrics.claimedJobs,
    lastTickAt: metrics.lastTickAt,
    note: "status idle/running is from HUNT queue, not publish Setting",
  });

  console.log("\n=== 6. Simulate one tick claim (lock) ===");
  if (willDrain) {
    const before = await getBuyerPublishJob();
    console.log("Publish job found", { jobId: before?.id });
    console.log("Batch found", {
      currentBatch: before?.currentBatch,
      cursor: before?.cursor,
      batchSize: before?.batchSize,
    });
    // Don't actually run full approve — just show lock branch by reading tick source
    console.log(
      "Claim mechanism: tickBuyerPublishJob sets lockedUntil = now+120s (Setting upsert), NOT SupplierJob claim"
    );
  }

  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
