import "dotenv/config";
import { prisma } from "../lib/prisma";
import {
  getLatestBuyerScan,
  listBuyerRanking,
  resolveBuyerRankingScanId,
} from "../lib/buyer/scan";

async function main() {
  const latest = await getLatestBuyerScan();
  const scanId = await resolveBuyerRankingScanId();
  const ranking = await listBuyerRanking({ limit: 120 });
  const rankedAll = await prisma.buyerCandidate.count({
    where: { scanRunId: scanId || undefined, status: "ranked" },
  });
  const rankedBest = await prisma.buyerCandidate.count({
    where: {
      scanRunId: scanId || undefined,
      status: "ranked",
      isBestInGroup: true,
    },
  });
  const withImages = ranking.filter((r) => r.imageUrl).length;
  const sample = ranking.slice(0, 5).map((r) => ({
    id: r.id,
    scanRunId: r.scanRunId,
    title: r.title?.slice(0, 60),
    imageUrl: r.imageUrl?.slice(0, 80),
    shopMatchPct: r.shopMatchPct,
    overallScore: r.overallScore,
    isBestInGroup: r.isBestInGroup,
  }));

  console.log(
    JSON.stringify(
      {
        latestScan: {
          id: latest?.id,
          status: latest?.status,
          scanned: latest?.scanned,
          kept: latest?.kept,
          target: latest?.targetScanCount,
        },
        resolveBuyerRankingScanId: scanId,
        rankedAllForScan: rankedAll,
        rankedBestInGroup: rankedBest,
        apiWouldReturn: ranking.length,
        withImages,
        sample,
        allFromLatest:
          ranking.length > 0 &&
          ranking.every((r) => r.scanRunId === latest?.id),
      },
      null,
      2
    )
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
