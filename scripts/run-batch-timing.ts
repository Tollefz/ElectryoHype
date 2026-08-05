import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { enqueueSupplierJob } from "../lib/suppliers/workers/jobs";
import { tickBuyerHuntWorker } from "../lib/buyer/buyer-worker";

const p = new PrismaClient();

async function main() {
  const stuck = await p.supplierJob.findMany({
    where: {
      type: "buyer_scan_batch",
      status: { in: ["running", "locked"] },
    },
  });

  for (const j of stuck) {
    const started = j.startedAt || j.lockedAt || j.createdAt;
    const ageMin = Math.round((Date.now() - started.getTime()) / 60000);
    // Only free if no scan progress for a while (hung old worker)
    console.log("freeing stuck", j.id.slice(-8), "ageMin", ageMin, j.lockedBy);
    await p.supplierJob.update({
      where: { id: j.id },
      data: {
        status: "dead",
        deadAt: new Date(),
        finishedAt: new Date(),
        lockedBy: null,
        lockExpiresAt: null,
        lastError: "Freed for batch-timing measurement (hung without progress)",
        progressMessage: "Dead-letter: timing probe",
      },
    });
  }

  const scan = await p.buyerScanRun.findFirst({
    where: { status: "running" },
    orderBy: { createdAt: "desc" },
  });
  if (!scan) {
    console.log("No running scan");
    await p.$disconnect();
    return;
  }

  await enqueueSupplierJob({
    type: "buyer_scan_batch",
    idempotencyKey: `buyer_scan_batch:${scan.id}:timing:${Date.now()}`,
    payload: { scanRunId: scan.id },
  });
  console.log("enqueued timing batch for", scan.id);

  const runs = Math.max(1, Math.min(5, Number(process.env.BATCH_TIMING_RUNS || 3)));
  for (let i = 0; i < runs; i++) {
    const r = await tickBuyerHuntWorker({
      workerId: `timing-probe-${Date.now()}-${i}`,
      concurrency: 1,
      limit: 1,
    });
    console.log(
      `tick ${i + 1}: claimed=${r.claimed} succeeded=${r.succeeded} failed=${r.failed}`
    );
    if (r.claimed === 0) break;
  }

  const timing = await p.setting.findUnique({
    where: { key: "buyer_batch_timing" },
  });
  console.log("\n=== TIMING ===");
  console.log(JSON.stringify(timing?.value, null, 2));
  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
