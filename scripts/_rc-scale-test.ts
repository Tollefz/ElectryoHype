/**
 * RC scale republish with timing + memory samples.
 * Usage: ... scripts/_rc-scale-test.ts [n]
 */
import { PrismaClient } from "@prisma/client";
import {
  dismissBuyerPublishJob,
  tickBuyerPublishJob,
  getBuyerPublishJob,
} from "../lib/buyer/publish-job";
import {
  getRepublishBoard,
  startBuyerRepublishJob,
} from "../lib/buyer/republish";

const prisma = new PrismaClient();

function memMB() {
  const m = process.memoryUsage();
  return {
    rss: Math.round(m.rss / 1024 / 1024),
    heapUsed: Math.round(m.heapUsed / 1024 / 1024),
  };
}

async function main() {
  const n = Math.max(1, Math.min(150, Number(process.argv[2] || 1)));
  const existing = await getBuyerPublishJob("republish");
  if (existing?.status === "running") {
    await dismissBuyerPublishJob("republish");
  }

  const board = await getRepublishBoard({ status: "ready", limit: 1 });
  const ids = board.readyIds.slice(0, n);
  if (ids.length < n) {
    console.warn(`Only ${ids.length} ready (wanted ${n})`);
  }

  const t0 = Date.now();
  const mem0 = memMB();
  console.log("START", { n: ids.length, mem: mem0 });

  await startBuyerRepublishJob({
    ids,
    fillMissingPricing: false,
    batchSize: Math.min(10, Math.max(5, ids.length)),
    actorEmail: "rc-scale@local",
  });

  const tickTimes: number[] = [];
  const maxTicks = Math.ceil(ids.length / 5) + 5;
  for (let i = 0; i < maxTicks; i++) {
    const tt0 = Date.now();
    const after = await tickBuyerPublishJob({
      kind: "republish",
      workerId: `rc-scale-${n}`,
      batchSize: Math.min(10, Math.max(5, ids.length)),
    });
    const dt = Date.now() - tt0;
    tickTimes.push(dt);
    console.log(`TICK ${i + 1}`, {
      ms: dt,
      status: after?.status,
      published: after?.published,
      skipped: after?.skipped,
      failed: after?.failed,
      mem: memMB(),
    });
    if (!after || after.status === "done" || after.status === "error") break;
  }

  const final = await getBuyerPublishJob("republish");
  const elapsed = Date.now() - t0;
  const mem1 = memMB();

  // Dup check: unique supplier keys among just-published candidates
  const cands = await prisma.buyerCandidate.findMany({
    where: { id: { in: ids } },
    select: { supplier: true, supplierProductId: true, status: true },
  });
  const keys = cands.map((c) => `${c.supplier}:${c.supplierProductId}`);
  const products = await prisma.product.findMany({
    where: {
      supplierProductId: { in: cands.map((c) => c.supplierProductId) },
    },
    select: {
      id: true,
      supplierName: true,
      supplierProductId: true,
      isActive: true,
    },
  });
  const byKey = new Map<string, number>();
  for (const p of products) {
    const k = `${p.supplierName}:${p.supplierProductId}`;
    byKey.set(k, (byKey.get(k) || 0) + 1);
  }
  const dupKeys = [...byKey.entries()].filter(([, c]) => c > 1);

  console.log(
    "RESULT",
    JSON.stringify(
      {
        n: ids.length,
        status: final?.status,
        published: final?.published,
        skipped: final?.skipped,
        failed: final?.failed,
        elapsedMs: elapsed,
        elapsedMin: Math.round((elapsed / 60_000) * 10) / 10,
        ppm:
          elapsed > 0
            ? Math.round(((final?.published || 0) / (elapsed / 60_000)) * 10) /
              10
            : null,
        tickMs: {
          min: Math.min(...tickTimes),
          max: Math.max(...tickTimes),
          avg: Math.round(
            tickTimes.reduce((a, b) => a + b, 0) / Math.max(1, tickTimes.length)
          ),
        },
        memBefore: mem0,
        memAfter: mem1,
        heapDeltaMB: mem1.heapUsed - mem0.heapUsed,
        duplicateSupplierKeys: dupKeys.length,
        importedCandidates: cands.filter((c) => c.status === "imported")
          .length,
        unexpectedSkips: (final?.skipped || 0) > 0 ? final?.skipped : 0,
      },
      null,
      2
    )
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
