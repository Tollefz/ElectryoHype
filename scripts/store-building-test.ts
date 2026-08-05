/**
 * Store Building Test — read-only analysis of buyer hunt quality.
 * Does not change algorithms. Does not publish. Documents snapshots only.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { matchFamily, familyLabel } from "../lib/intelligence/families";
import { primaryGroupForFamily } from "../lib/buyer/product-focus-core";

const prisma = new PrismaClient();
const MILESTONES = [100, 250, 500, 1000, 1500, 2000];

type Cand = {
  id: string;
  title: string;
  status: string;
  shopMatchPct: number;
  overallScore: number;
  createdAt: Date;
  pricing: unknown;
  scores: unknown;
  snapshot: unknown;
};

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function countSimilarTitles(title: string, others: string[], threshold = 0.6): number {
  const stop = new Set([
    "for",
    "with",
    "and",
    "the",
    "til",
    "med",
    "og",
    "usb",
    "type",
    "pro",
    "plus",
  ]);
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9æøå\s]/gi, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !stop.has(t))
    );
  const A = tokens(title);
  if (!A.size) return 0;
  let n = 0;
  for (const o of others) {
    if (!o || o === title) continue;
    const B = tokens(o);
    if (!B.size) continue;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter += 1;
    if (inter / Math.max(A.size, B.size) >= threshold) n += 1;
  }
  return n;
}

function pricingOf(c: Cand) {
  const p =
    c.pricing && typeof c.pricing === "object"
      ? (c.pricing as Record<string, unknown>)
      : {};
  const margin =
    num(p.marginPct) ?? num(p.estimatedMarginPct) ?? num(p.grossMarginPct);
  const retail = num(p.retailNOK) ?? num(p.estimatedRetailNOK);
  const landed = num(p.landedCostNOK);
  const cost = num(p.costNOK);
  const econ =
    p.economic && typeof p.economic === "object"
      ? (p.economic as Record<string, unknown>)
      : null;
  const conf = num(p.economicConfidence) ?? num(econ?.confidence);
  return { margin, retail, landed, cost, conf };
}

function isAiRecommend(c: Cand): boolean {
  const { margin, conf } = pricingOf(c);
  if (c.status !== "ranked") return false;
  if (c.shopMatchPct < 65) return false;
  if (margin != null && margin < 25) return false;
  if (conf != null && conf < 85 && c.shopMatchPct < 80) return false;
  return c.shopMatchPct >= 78 || (c.shopMatchPct >= 70 && (margin ?? 0) >= 35);
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function snapshotAt(all: Cand[], analyzedCap: number) {
  const window = all.filter((_, i) => i < analyzedCap);
  const recommended = window.filter(isAiRecommend);

  const byFamily: Record<string, number> = {};
  const byGroup: Record<string, number> = {};
  const margins: number[] = [];
  const landeds: number[] = [];
  const retails: number[] = [];
  const titles: string[] = [];

  for (const c of recommended) {
    const fam = matchFamily(c.title) || "other";
    byFamily[fam] = (byFamily[fam] || 0) + 1;
    const g = primaryGroupForFamily(fam)?.id || "other";
    byGroup[g] = (byGroup[g] || 0) + 1;
    const pr = pricingOf(c);
    if (pr.margin != null) margins.push(pr.margin);
    if (pr.landed != null) landeds.push(pr.landed);
    else if (pr.cost != null) landeds.push(pr.cost);
    if (pr.retail != null) retails.push(pr.retail);
    titles.push(c.title);
  }

  let nearDupes = 0;
  for (let i = 0; i < titles.length; i++) {
    const sim = countSimilarTitles(
      titles[i],
      titles.filter((_, j) => j !== i),
      0.6
    );
    if (sim >= 1) nearDupes += 1;
  }

  const familyEntries = Object.entries(byFamily).sort((a, b) => b[1] - a[1]);
  const dominant = familyEntries.slice(0, 8).map(([id, n]) => ({
    id,
    label: familyLabel(id),
    count: n,
    pct:
      recommended.length > 0
        ? Math.round((n / recommended.length) * 1000) / 10
        : 0,
  }));
  const coreExpected = [
    "gaming_mouse",
    "gaming_keyboard",
    "headset",
    "usb_c_hub",
    "ssd",
    "powerbank",
    "docking_station",
    "led_lighting",
    "hdmi_cable",
    "webcam",
    "microphone",
    "smart_plug",
  ];
  const missing = coreExpected
    .filter((id) => !byFamily[id])
    .map((id) => ({ id, label: familyLabel(id) }));

  const priceBands = { budget: 0, mid: 0, premium: 0 };
  for (const r of retails) {
    if (r < 199) priceBands.budget += 1;
    else if (r < 799) priceBands.mid += 1;
    else priceBands.premium += 1;
  }

  const groupPct = Object.entries(byGroup)
    .map(([id, n]) => ({
      id,
      n,
      pct:
        recommended.length > 0
          ? Math.round((n / recommended.length) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.n - a.n);

  return {
    analyzedCap,
    candidatesInWindow: window.length,
    rankedInWindow: window.filter((c) => c.status === "ranked").length,
    recommendedCount: recommended.length,
    byGroup: groupPct,
    byFamily,
    dominant,
    missing,
    avgMargin: avg(margins),
    avgLanded: avg(landeds),
    avgRetail: avg(retails),
    priceBands,
    nearDupeProducts: nearDupes,
    nearDupePct:
      recommended.length > 0
        ? Math.round((nearDupes / recommended.length) * 100)
        : 0,
  };
}

async function main() {
  const products = await prisma.product.count({ where: { isActive: true } });
  const runs = await prisma.buyerScanRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 15,
    select: {
      id: true,
      status: true,
      scanned: true,
      kept: true,
      filtered: true,
      targetScanCount: true,
      startedAt: true,
    },
  });

  const run =
    runs.find((r) => r.scanned >= 2000) ||
    [...runs].sort((a, b) => b.scanned - a.scanned)[0] ||
    null;

  if (!run) {
    console.error(JSON.stringify({ error: "NO_SCAN_RUN", products, runs }));
    process.exit(2);
  }

  const rows = await prisma.buyerCandidate.findMany({
    where: { scanRunId: run.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      status: true,
      shopMatchPct: true,
      overallScore: true,
      createdAt: true,
      pricing: true,
      scores: true,
      snapshot: true,
    },
  });

  const all: Cand[] = rows.map((r) => ({
    id: r.id,
    title: r.title || "",
    status: r.status,
    shopMatchPct: r.shopMatchPct,
    overallScore: r.overallScore,
    createdAt: r.createdAt,
    pricing: r.pricing,
    scores: r.scores,
    snapshot: r.snapshot,
  }));

  const snapshots = MILESTONES.map((m) => snapshotAt(all, m));

  const out = {
    meta: {
      runId: run.id,
      runScanned: run.scanned,
      runKept: run.kept,
      runFiltered: run.filtered,
      runStatus: run.status,
      targetScanCount: run.targetScanCount,
      startedAt: run.startedAt,
      candidateRows: all.length,
      activeCatalogProducts: products,
      emptyStore: products === 0,
      note:
        products > 0
          ? "Butikk er IKKE tom — assortment så ekte katalog. Anbefalte kandidater = virtuelt publisert sett (ingen faktisk publish)."
          : "Tom katalog — discovery bygde fra null.",
      method:
        "Snapshot N = første N kandidat-upserts i jaktrekkefølge ≈ analyser. AI-anbefaling = ranked + match/margin/econ heuristikk.",
      dataSufficientFor2000: all.length >= 2000 || run.scanned >= 2000,
      recentRuns: runs.slice(0, 5),
    },
    snapshots,
  };

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
