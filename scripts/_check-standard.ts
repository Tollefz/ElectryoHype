import "dotenv/config";
import { prisma } from "../lib/prisma";
import { parseScanRequest } from "../lib/buyer/category-missions";
import { listBuyerRanking } from "../lib/buyer/scan";

async function main() {
  const id = "cms6mljv00000vff4n3a0ngin";
  const r = await prisma.buyerScanRun.findUnique({ where: { id } });
  const p = parseScanRequest(r?.request);
  const ranking = await listBuyerRanking({ scanRunId: id, limit: 200 });
  const counts = await prisma.buyerCandidate.groupBy({
    by: ["status"],
    where: { scanRunId: id },
    _count: true,
  });
  console.log(
    JSON.stringify(
      {
        status: r?.status,
        scanned: r?.scanned,
        kept: r?.kept,
        filtered: r?.filtered,
        target: r?.targetScanCount,
        error: r?.error,
        finishedAt: r?.finishedAt,
        stage: p.progress?.stage,
        result: p.result,
        rankingCount: ranking.length,
        counts,
      },
      null,
      2
    )
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
