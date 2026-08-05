/**
 * Store Building Test — Discovery-era partial hunt snapshots (read-only).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { matchFamily, familyLabel } from "../lib/intelligence/families";
import { primaryGroupForFamily } from "../lib/buyer/product-focus-core";

const prisma = new PrismaClient();
const MILESTONES = [100, 250, 500, 1000, 1360];

type Cand = {
  title: string;
  status: string;
  shopMatchPct: number;
  pricing: unknown;
};

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pricingOf(c: Cand) {
  const p =
    c.pricing && typeof c.pricing === "object"
      ? (c.pricing as Record<string, unknown>)
      : {};
  return {
    margin: num(p.marginPct) ?? num(p.estimatedMarginPct),
    retail: num(p.retailNOK) ?? num(p.estimatedRetailNOK),
    landed: num(p.landedCostNOK),
    cost: num(p.costNOK),
  };
}

function isAiRecommend(c: Cand): boolean {
  const { margin } = pricingOf(c);
  if (c.status !== "ranked") return false;
  if (c.shopMatchPct < 65) return false;
  if (margin != null && margin < 25) return false;
  return c.shopMatchPct >= 78 || (c.shopMatchPct >= 70 && (margin ?? 0) >= 35);
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function countSimilarTitles(title: string, others: string[], threshold = 0.6): number {
  const stop = new Set(["for", "with", "and", "the", "til", "med", "og", "usb", "type", "pro", "plus"]);
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
    if (
      countSimilarTitles(
        titles[i],
        titles.filter((_, j) => j !== i),
        0.6
      ) >= 1
    )
      nearDupes += 1;
  }

  const dominant = Object.entries(byFamily)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, n]) => ({
      id,
      label: familyLabel(id),
      count: n,
      pct: recommended.length
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

  return {
    analyzedCap,
    recommendedCount: recommended.length,
    byGroup: Object.entries(byGroup)
      .map(([id, n]) => ({
        id,
        n,
        pct: recommended.length
          ? Math.round((n / recommended.length) * 1000) / 10
          : 0,
      }))
      .sort((a, b) => b.n - a.n),
    dominant,
    missing,
    avgMargin: avg(margins),
    avgLanded: avg(landeds),
    avgRetail: avg(retails),
    priceBands,
    nearDupePct: recommended.length
      ? Math.round((nearDupes / recommended.length) * 100)
      : 0,
  };
}

async function main() {
  const runId = "cms9g1qzh00f4vf80v7ufeq6b";
  const run = await prisma.buyerScanRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      scanned: true,
      kept: true,
      filtered: true,
      status: true,
      startedAt: true,
      checkpoint: true,
    },
  });
  const rows = await prisma.buyerCandidate.findMany({
    where: { scanRunId: runId },
    orderBy: { createdAt: "asc" },
    select: {
      title: true,
      status: true,
      shopMatchPct: true,
      pricing: true,
    },
  });
  const all: Cand[] = rows.map((r) => ({
    title: r.title || "",
    status: r.status,
    shopMatchPct: r.shopMatchPct,
    pricing: r.pricing,
  }));
  const caps = MILESTONES.filter((m) => m <= all.length);
  if (all.length > 0 && !caps.includes(all.length)) caps.push(all.length);

  console.log(
    JSON.stringify(
      {
        meta: {
          runId,
          scanned: run?.scanned,
          kept: run?.kept,
          filtered: run?.filtered,
          status: run?.status,
          startedAt: run?.startedAt,
          candidates: all.length,
          discovery:
            run?.checkpoint && typeof run.checkpoint === "object"
              ? (run.checkpoint as Record<string, unknown>).discovery
              : null,
        },
        snapshots: caps.map((m) => snapshotAt(all, m)),
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
