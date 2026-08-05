import "dotenv/config";
import { prisma } from "../lib/prisma";
import { parseScanRequest } from "../lib/buyer/category-missions";

async function main() {
  const id = "cms6krztf0001vfqkcohfemye";
  const r = await prisma.buyerScanRun.findUnique({ where: { id } });
  const p = parseScanRequest(r?.request);
  const counts = await prisma.buyerCandidate.groupBy({
    by: ["status"],
    where: { scanRunId: id },
    _count: true,
  });
  const q = await prisma.importQueueItem.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      supplier: true,
      supplierProductId: true,
      title: true,
      productId: true,
      pipelineStage: true,
      createdAt: true,
    },
  });
  const std = await prisma.buyerScanRun.findUnique({
    where: { id: "cms6dls6h002vvf2gmohqpa7e" },
  });
  const night = await prisma.buyerScanRun.findUnique({
    where: { id: "cms6ksmgd0033vfqkprxqlkwl" },
  });
  const deep = await prisma.buyerScanRun.findUnique({
    where: { id: "cms6kslb20030vfqkhfc0rfhs" },
  });
  const cp = (r?.checkpoint || {}) as {
    page?: number;
    seedIdx?: number;
    supplierIdx?: number;
    seenKeys?: string[];
  };
  console.log(
    JSON.stringify(
      {
        quick: {
          status: r?.status,
          target: r?.targetScanCount,
          scanned: r?.scanned,
          kept: r?.kept,
          filtered: r?.filtered,
          stage: p.progress?.stage,
          missionSize: p.missionSize,
          checkpoint: {
            page: cp.page,
            seedIdx: cp.seedIdx,
            supplierIdx: cp.supplierIdx,
            seen: (cp.seenKeys || []).length,
          },
        },
        counts,
        queue: q,
        oldStandard: {
          id: std?.id,
          status: std?.status,
          target: std?.targetScanCount,
          scanned: std?.scanned,
          kept: std?.kept,
          filtered: std?.filtered,
        },
        deep: {
          id: deep?.id,
          status: deep?.status,
          target: deep?.targetScanCount,
          scanned: deep?.scanned,
        },
        night: {
          id: night?.id,
          status: night?.status,
          target: night?.targetScanCount,
          scanned: night?.scanned,
        },
        hourLocal: new Date().getHours(),
      },
      null,
      2
    )
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
