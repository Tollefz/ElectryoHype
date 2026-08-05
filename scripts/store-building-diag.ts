/**
 * Extra diagnostics for Store Building Test (read-only).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { matchFamily } from "../lib/intelligence/families";

const prisma = new PrismaClient();

async function main() {
  const runId = "cms7c836d0k6yvf7kre8s0hsa";
  const rows = await prisma.buyerCandidate.findMany({
    where: { scanRunId: runId },
    orderBy: { createdAt: "asc" },
    select: {
      title: true,
      status: true,
      shopMatchPct: true,
      pricing: true,
      createdAt: true,
    },
  });

  const byFam: Record<string, number> = {};
  const byFamAll: Record<string, number> = {};
  for (const r of rows) {
    const fam = matchFamily(r.title || "") || "other";
    byFamAll[fam] = (byFamAll[fam] || 0) + 1;
    if (r.status === "ranked") byFam[fam] = (byFam[fam] || 0) + 1;
  }

  function mix(arr: typeof rows) {
    const m: Record<string, number> = {};
    for (const r of arr) {
      if (r.status !== "ranked") continue;
      const fam = matchFamily(r.title || "") || "other";
      m[fam] = (m[fam] || 0) + 1;
    }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }

  const first = rows.slice(0, 2000);
  const mid = rows.slice(4000, 6000);
  const last = rows.slice(-2000);

  const cases = rows
    .filter(
      (r) =>
        matchFamily(r.title || "") === "phone_case" && r.status === "ranked"
    )
    .slice(0, 10)
    .map((r) => r.title);

  // Pricing coverage
  let withLanded = 0;
  let withMargin = 0;
  let withRetail = 0;
  for (const r of rows.slice(0, 2000)) {
    if (r.status !== "ranked") continue;
    const p =
      r.pricing && typeof r.pricing === "object"
        ? (r.pricing as Record<string, unknown>)
        : {};
    if (p.landedCostNOK != null) withLanded += 1;
    if (p.marginPct != null || p.estimatedMarginPct != null) withMargin += 1;
    if (p.retailNOK != null || p.estimatedRetailNOK != null) withRetail += 1;
  }

  const run = await prisma.buyerScanRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      startedAt: true,
      status: true,
      scanned: true,
      error: true,
      checkpoint: true,
      request: true,
      discovery: true,
    },
  });

  let discoveryInProgress: unknown = null;
  const cp = run?.checkpoint;
  if (cp && typeof cp === "object") {
    const p = cp as Record<string, unknown>;
    discoveryInProgress = {
      hasDiscovery: Boolean(p.discovery),
      keys: Object.keys(p).slice(0, 30),
      discovery: p.discovery ?? null,
      seedIdx: p.seedIdx ?? null,
      seedQuery: p.seedQuery ?? p.query ?? null,
    };
  }

  // Running discovery-era run
  const run2Id = "cms9g1qzh00f4vf80v7ufeq6b";
  const rows2 = await prisma.buyerCandidate.findMany({
    where: { scanRunId: run2Id },
    orderBy: { createdAt: "asc" },
    select: { title: true, status: true },
  });
  const mix2: Record<string, number> = {};
  for (const r of rows2) {
    if (r.status !== "ranked") continue;
    const fam = matchFamily(r.title || "") || "other";
    mix2[fam] = (mix2[fam] || 0) + 1;
  }
  const run2 = await prisma.buyerScanRun.findUnique({
    where: { id: run2Id },
    select: {
      id: true,
      scanned: true,
      status: true,
      startedAt: true,
      checkpoint: true,
      discovery: true,
      request: true,
    },
  });

  // Catalog mix
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { name: true, category: true },
    take: 50,
  });
  const catMix: Record<string, number> = {};
  for (const p of products) {
    const fam = matchFamily(p.name || "") || "other";
    catMix[fam] = (catMix[fam] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        runMeta: {
          id: run?.id,
          startedAt: run?.startedAt,
          status: run?.status,
          scanned: run?.scanned,
          error: run?.error,
          discoveryInProgress,
        },
        pricingCoverageFirst2kRanked: { withLanded, withMargin, withRetail },
        fullRankedTop: Object.entries(byFam)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15),
        fullAllTop: Object.entries(byFamAll)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15),
        first2kRanked: mix(first),
        mid2kRanked: mix(mid),
        last2kRanked: mix(last),
        sampleCases: cases,
        runningRun: {
          id: run2?.id,
          scanned: run2?.scanned,
          status: run2?.status,
          candidates: rows2.length,
          rankedTop: Object.entries(mix2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15),
          checkpointKeys:
            run2?.checkpoint && typeof run2.checkpoint === "object"
              ? Object.keys(run2.checkpoint as object)
              : [],
          discoveryState: run2?.discovery ?? null,
          checkpointDiscovery:
            run2?.checkpoint && typeof run2.checkpoint === "object"
              ? (run2.checkpoint as Record<string, unknown>).discovery
              : null,
        },
        catalog: {
          count: products.length,
          byFamily: Object.entries(catMix).sort((a, b) => b[1] - a[1]),
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
