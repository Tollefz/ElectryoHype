import { PrismaClient, ImportQueueStatus } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const jobRow = await p.setting.findUnique({ where: { key: "buyer_publish_job" } });
  const job = jobRow?.value as Record<string, unknown> | null;
  const active = await p.product.count({ where: { isActive: true } });
  const publishedQ = await p.importQueueItem.count({
    where: { status: ImportQueueStatus.published },
  });
  const w = await p.setting.findUnique({ where: { key: "buyer_hunt_worker" } });
  const wv = (w?.value || {}) as Record<string, unknown>;
  console.log(
    JSON.stringify(
      {
        job: job
          ? {
              id: job.id,
              status: job.status,
              published: job.published,
              cursor: job.cursor,
              total: Array.isArray(job.candidateIds)
                ? job.candidateIds.length
                : 0,
              requestId: job.requestId,
              startedAt: job.startedAt,
            }
          : null,
        products: { active, publishedQueue: publishedQ },
        worker: { lastTickAt: wv.lastTickAt },
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
