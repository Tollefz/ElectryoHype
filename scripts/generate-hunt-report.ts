/**
 * Build hunt report for a scan (largest by default) and optionally save.
 * Usage: npx tsx scripts/generate-hunt-report.ts [--save] [--id=SCAN_ID]
 */
import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { buildProductHuntReport } from "../lib/buyer/hunt-report";

const prisma = new PrismaClient();
const save = process.argv.includes("--save");
const idArg = process.argv.find((a) => a.startsWith("--id="));
const preferId = idArg ? idArg.slice(5) : null;

async function main() {
  const run = preferId
    ? await prisma.buyerScanRun.findUnique({ where: { id: preferId } })
    : (
        await prisma.buyerScanRun.findMany({
          orderBy: { scanned: "desc" },
          take: 5,
        })
      )[0];

  if (!run) {
    console.error("No scan found");
    process.exit(2);
  }

  const board = await prisma.buyerCandidate.findMany({
    where: {
      scanRunId: run.id,
      status: { in: ["ranked", "imported", "queued"] },
      isBestInGroup: true,
    },
  });

  const req =
    run.request && typeof run.request === "object"
      ? (run.request as Record<string, unknown>)
      : {};

  const dismissed = await prisma.buyerCandidate.count({
    where: { scanRunId: run.id, status: "dismissed" },
  });
  const publishedFromHunt = await prisma.buyerCandidate.count({
    where: { scanRunId: run.id, status: "imported" },
  });
  const passedQg = board.filter(
    (c) => c.shopMatchPct >= 65 && c.overallScore >= 55
  ).length;

  const huntReport = buildProductHuntReport({
    scanRunId: run.id,
    analyzed: run.scanned,
    discarded: run.filtered + dismissed,
    published: publishedFromHunt,
    approvedCandidates: passedQg,
    candidates: board.map((c) => ({
      title: c.title || "",
      status: c.status,
      shopMatchPct: c.shopMatchPct,
      overallScore: c.overallScore,
      pricing: c.pricing,
      snapshot: c.snapshot,
      scores: c.scores,
    })),
    familyTargets: null,
  });

  console.log(
    `Run ${run.id} status=${run.status} scanned=${run.scanned} board=${board.length} approved=${passedQg}`
  );
  console.log(huntReport.text);

  if (save) {
    await prisma.buyerScanRun.update({
      where: { id: run.id },
      data: {
        request: {
          ...req,
          huntReport,
        } as Prisma.InputJsonValue,
      },
    });
    console.log("\n[saved huntReport to request.huntReport]");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
