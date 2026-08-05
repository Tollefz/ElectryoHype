import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { matchFamily } from "../lib/intelligence/families";

const prisma = new PrismaClient();
const runId = "cms9g1qzh00f4vf80v7ufeq6b";

async function main() {
  const ranked = await prisma.buyerCandidate.findMany({
    where: { scanRunId: runId, status: "ranked", rank: { not: null } },
    select: {
      id: true,
      title: true,
      rank: true,
      shopMatchPct: true,
      scores: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: { rank: "asc" },
    take: 30,
  });

  // Check if scores have merch from old finalize
  let withMerch = 0;
  let withoutMerch = 0;
  for (const r of ranked) {
    const s =
      r.scores && typeof r.scores === "object"
        ? (r.scores as Record<string, unknown>)
        : {};
    if (s.butikkscore != null || s.merchScore != null) withMerch += 1;
    else withoutMerch += 1;
  }

  // Compare createdAt vs when this run started
  const run = await prisma.buyerScanRun.findUnique({
    where: { id: runId },
    select: { startedAt: true },
  });
  const start = run?.startedAt?.getTime() || 0;
  let createdBeforeRun = 0;
  let createdDuringRun = 0;
  for (const r of ranked) {
    if (r.createdAt.getTime() < start - 60_000) createdBeforeRun += 1;
    else createdDuringRun += 1;
  }

  // Filter reject reasons for powerbank
  const pbFiltered = await prisma.buyerCandidate.findMany({
    where: { scanRunId: runId, status: "filtered" },
    select: { title: true, filterReasons: true, shopMatchPct: true },
    take: 800,
  });
  const pbReasons: Record<string, number> = {};
  let pbCount = 0;
  let msCount = 0;
  const msReasons: Record<string, number> = {};
  for (const r of pbFiltered) {
    const fam = matchFamily(r.title || "");
    const reasons = Array.isArray(r.filterReasons)
      ? r.filterReasons.map(String)
      : [];
    if (fam === "powerbank") {
      pbCount += 1;
      for (const x of reasons) pbReasons[x] = (pbReasons[x] || 0) + 1;
    }
    if (fam === "magsafe") {
      msCount += 1;
      for (const x of reasons) msReasons[x] = (msReasons[x] || 0) + 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        top30: ranked.slice(0, 20).map((r) => ({
          rank: r.rank,
          fam: matchFamily(r.title || ""),
          match: r.shopMatchPct,
          title: (r.title || "").slice(0, 55),
          createdVsRunStartSec: Math.round(
            (r.createdAt.getTime() - start) / 1000
          ),
        })),
        merchOnRankedSample: { withMerch, withoutMerch },
        createdBeforeRun,
        createdDuringRun,
        powerbankFilterReasons: { n: pbCount, reasons: pbReasons },
        magsafeFilterReasons: { n: msCount, reasons: msReasons },
      },
      null,
      2
    )
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
