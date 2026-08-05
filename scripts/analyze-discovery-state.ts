/**
 * Post-hoc Discovery state summary (no decision log required).
 * Usage: npx tsx scripts/analyze-discovery-state.ts [--id=SCAN_ID]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  buildDiscoverySummary,
  parseDiscoveryValidation,
} from "../lib/buyer/discovery-validation";

const prisma = new PrismaClient();
const idArg = process.argv.find((a) => a.startsWith("--id="));

function parseDiscoveryState(raw: unknown) {
  const base = {
    familyScanCounts: {} as Record<string, number>,
    groupScanCounts: {} as Record<string, number>,
    recentFamilies: [] as string[],
    queryVariantIdx: {} as Record<string, number>,
    currentFamilyId: null as string | null,
    currentQuery: null as string | null,
    pagesOnCurrent: 0,
    emptyStreak: 0,
  };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    ...base,
    familyScanCounts:
      o.familyScanCounts && typeof o.familyScanCounts === "object"
        ? (o.familyScanCounts as Record<string, number>)
        : {},
    groupScanCounts:
      o.groupScanCounts && typeof o.groupScanCounts === "object"
        ? (o.groupScanCounts as Record<string, number>)
        : {},
  };
}

async function main() {
  const run = idArg
    ? await prisma.buyerScanRun.findUnique({ where: { id: idArg.slice(5) } })
    : (
        await prisma.buyerScanRun.findMany({
          orderBy: { startedAt: "desc" },
          take: 15,
        })
      ).find((r) => {
        const cp =
          r.checkpoint && typeof r.checkpoint === "object"
            ? (r.checkpoint as { discovery?: unknown })
            : null;
        return Boolean(cp?.discovery);
      });

  if (!run) {
    console.error("No discovery-enabled scan found");
    process.exit(2);
  }

  const cp =
    run.checkpoint && typeof run.checkpoint === "object"
      ? (run.checkpoint as { discovery?: unknown })
      : {};
  const state = parseDiscoveryState(cp.discovery);
  const req =
    run.request && typeof run.request === "object"
      ? (run.request as Record<string, unknown>)
      : {};
  const discVal = parseDiscoveryValidation(req.discoveryValidation);

  const summary = buildDiscoverySummary({
    scanRunId: run.id,
    decisions: discVal.decisions,
    familyScanCounts: state.familyScanCounts,
    groupScanCounts: state.groupScanCounts,
  });

  console.log(
    `Run ${run.id} status=${run.status} scanned=${run.scanned} decisions_logged=${discVal.decisions.length}`
  );
  console.log(summary.text);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
