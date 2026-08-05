/**
 * Diagnose why publish outcomes are skipped.
 */
import { approveAndPublishCandidates } from "../lib/buyer/approve-and-publish";
import { prisma } from "../lib/prisma";

async function main() {
  const row = await prisma.setting.findUnique({ where: { key: "buyer_publish_job" } });
  const job = row?.value as { candidateIds?: string[]; cursor?: number } | null;
  const ids = (job?.candidateIds || []).slice(job?.cursor || 0, (job?.cursor || 0) + 3);
  console.log("Sample ids", ids);
  const result = await approveAndPublishCandidates({
    ids,
    dryRun: true,
    thumbUp: true,
    limit: ids.length,
  });
  console.log(
    JSON.stringify(
      result.outcomes.map((o) => ({
        status: o.status,
        title: (o.title || "").slice(0, 60),
        message: o.message,
        problems: o.problems?.slice(0, 3),
      })),
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
