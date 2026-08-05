/**
 * Controlled republish test: dismiss stuck job → start N → force ticks until done.
 * Usage: ... scripts/_test-republish-n.ts [n]
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

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const n = Math.max(1, Math.min(50, Number(process.argv[2] || 1)));
  const maxTicks = Math.max(20, n * 5);

  const existing = await getBuyerPublishJob("republish");
  if (existing?.status === "running") {
    console.log("Dismissing stuck/running republish job", {
      total: existing.total,
      published: existing.published,
    });
    await dismissBuyerPublishJob("republish");
  }

  const board = await getRepublishBoard({ status: "ready", limit: 1 });
  const ids = board.readyIds.slice(0, n);
  if (!ids.length) throw new Error("No ready candidates");

  console.log("STARTING", { n: ids.length, ids: ids.slice(0, 5) });
  const started = await startBuyerRepublishJob({
    ids,
    fillMissingPricing: false,
    batchSize: 1,
    actorEmail: "diag@local",
  });
  console.log("JOB", {
    status: started.job.status,
    total: started.job.total,
    selected: started.selected,
  });

  for (let i = 0; i < maxTicks; i++) {
    const after = await tickBuyerPublishJob({
      kind: "republish",
      workerId: `diag-republish-${n}`,
    });
    console.log(`TICK ${i + 1}`, {
      status: after?.status,
      cursor: after?.cursor,
      published: after?.published,
      failed: after?.failed,
      skipped: after?.skipped,
      last: after?.lastPublishedProductName,
      stopReason: after?.stopReason,
    });
    if (!after || after.status === "done" || after.status === "failed") break;
    // Avoid hammering Shopify
    await sleep(500);
  }

  const final = await getBuyerPublishJob("republish");
  console.log("FINAL_JOB", {
    status: final?.status,
    published: final?.published,
    failed: final?.failed,
    skipped: final?.skipped,
    total: final?.total,
    lastError: final?.lastError,
  });

  // Verify products for selected candidate supplier keys
  const cands = await prisma.buyerCandidate.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      supplier: true,
      supplierProductId: true,
      status: true,
      importQueueItemId: true,
    },
  });
  for (const c of cands) {
    const product = await prisma.product.findFirst({
      where: {
        supplierProductId: c.supplierProductId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        images: true,
        tags: true,
        updatedAt: true,
        isActive: true,
        _count: { select: { variants: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    let imageCount: number | null = null;
    try {
      const parsed = JSON.parse(product?.images || "[]");
      imageCount = Array.isArray(parsed) ? parsed.length : null;
    } catch {
      imageCount = product?.images ? 1 : 0;
    }
    console.log(
      "VERIFY",
      JSON.stringify(
        {
          candidateId: c.id,
          candidateStatus: c.status,
          title: c.title,
          product: product
            ? {
                id: product.id,
                name: product.name,
                slug: product.slug,
                updatedAt: product.updatedAt,
                isActive: product.isActive,
                imageCount,
                tags: product.tags?.slice(0, 120),
                variantCount: product._count.variants,
              }
            : null,
        },
        null,
        2
      )
    );
  }
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
