/**
 * Poll republish job + verify last published products.
 * Usage: ... scripts/_poll-republish.ts
 */
import { PrismaClient } from "@prisma/client";
import { getBuyerRepublishJob } from "../lib/buyer/republish";
import { getBuyerHuntWorkerStatus } from "../lib/buyer/buyer-worker";

const prisma = new PrismaClient();

async function main() {
  const job = await getBuyerRepublishJob();
  const w = await getBuyerHuntWorkerStatus();
  console.log(
    "JOB",
    JSON.stringify(
      job
        ? {
            status: job.status,
            done: job.done,
            total: job.total,
            failed: job.failed,
            skipped: job.skipped,
            published: job.published,
            currentTitle: job.currentTitle,
            lastError: job.lastError,
            productsPerMin: job.productsPerMin,
          }
        : null,
      null,
      2
    )
  );
  console.log(
    "WORKER",
    JSON.stringify(
      {
        status: w.status,
        lastTickAt: w.lastTickAt,
        lastBatch: w.lastBatch,
      },
      null,
      2
    )
  );

  const recent = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      slug: true,
      shopifyProductId: true,
      publishedAt: true,
      updatedAt: true,
      supplierName: true,
      supplierProductId: true,
      _count: { select: { variants: true, images: true } },
    },
  });
  console.log("RECENT_PRODUCTS", JSON.stringify(recent, null, 2));
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
