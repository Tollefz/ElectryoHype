import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const jobRow = await p.setting.findUnique({ where: { key: "buyer_publish_job" } });
  console.log("FULL_JOB", JSON.stringify(jobRow?.value, null, 2).slice(0, 4000));
  const w = await p.setting.findUnique({ where: { key: "buyer_hunt_worker" } });
  console.log(
    "WORKER",
    JSON.stringify(
      {
        lastTickAt: (w?.value as any)?.lastTickAt,
        lastBatch: (w?.value as any)?.lastBatch,
        lastException: (w?.value as any)?.lastException,
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
