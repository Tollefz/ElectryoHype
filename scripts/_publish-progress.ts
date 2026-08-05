import { PrismaClient, ImportQueueStatus } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const job = (await p.setting.findUnique({ where: { key: "buyer_publish_job" } }))
    ?.value as Record<string, any>;
  const active = await p.product.count({ where: { isActive: true } });
  const publishedQ = await p.importQueueItem.count({
    where: { status: ImportQueueStatus.published },
  });
  console.log(
    JSON.stringify(
      {
        jobId: job?.id,
        requestId: job?.requestId,
        status: job?.status,
        cursor: job?.cursor,
        total: job?.candidateIds?.length,
        published: job?.published,
        skipped: job?.skipped,
        failed: job?.failed,
        batchIndex: job?.batchIndex,
        lastProduct: job?.lastPublishedProductName,
        nextBatch: job?.nextBatchProductName,
        events: (job?.events || []).slice(-8).map((e: any) => e.message),
        productsActive: active,
        publishedQueue: publishedQ,
      },
      null,
      2
    )
  );
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
