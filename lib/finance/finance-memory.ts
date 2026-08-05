/**
 * Finance Memory — learns which products/families make or lose money.
 * Never changes prices. Additive insight only.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { matchFamily, familyLabel } from "@/lib/intelligence/families";
import { getFinanceDashboard } from "./finance-dashboard";
import { marginPct, round2 } from "./finance-math";

export const FINANCE_MEMORY_SETTING_KEY = "finance_brain_memory";
const STALE_MS = 30 * 60_000;

export type FinanceMemoryStory = {
  id: string;
  text: string;
  polarity: "positive" | "negative" | "neutral";
  why: string;
};

export type FinanceMemorySnapshot = {
  version: 1;
  storeId: string;
  rebuiltAt: string;
  lookbackDays: number;
  stories: FinanceMemoryStory[];
  winners: Array<{ name: string; marginPct: number; profit: number; why: string }>;
  losers: Array<{ name: string; marginPct: number | null; profit: number; why: string }>;
  stats: {
    memoryScore: number;
    productsSeen: number;
    lossCount: number;
    winCount: number;
  };
};

function emptySnap(storeId: string, lookbackDays: number): FinanceMemorySnapshot {
  return {
    version: 1,
    storeId,
    rebuiltAt: new Date().toISOString(),
    lookbackDays,
    stories: [],
    winners: [],
    losers: [],
    stats: { memoryScore: 0, productsSeen: 0, lossCount: 0, winCount: 0 },
  };
}

export async function rebuildFinanceMemory(opts?: {
  storeId?: string;
  lookbackDays?: number;
}): Promise<FinanceMemorySnapshot> {
  const storeId = opts?.storeId || DEFAULT_STORE_ID;
  const lookbackDays = opts?.lookbackDays ?? 30;
  const dash = await getFinanceDashboard(lookbackDays, storeId);
  const nowIso = new Date().toISOString();

  if (dash.empty) {
    const snap = emptySnap(storeId, lookbackDays);
    snap.rebuiltAt = nowIso;
    await persist(snap);
    return snap;
  }

  const stories: FinanceMemoryStory[] = [];
  const winners = dash.profitable.slice(0, 8).map((p) => ({
    name: p.name,
    marginPct: p.marginPct ?? 0,
    profit: p.profit,
    why: `${p.units} solgt · fortjeneste ${Math.round(p.profit)} kr · margin ${p.marginPct ?? "—"} %`,
  }));
  const losers = dash.lossMaking.slice(0, 8).map((p) => ({
    name: p.name,
    marginPct: p.marginPct,
    profit: p.profit,
    why:
      p.units > 0
        ? `${p.units} solgt · fortjeneste ${Math.round(p.profit)} kr`
        : `Katalogmargin ${p.marginPct ?? "—"} % (lav)`,
  }));

  if (losers.length > 0) {
    stories.push({
      id: "loss-batch",
      text:
        losers.length === 1
          ? `${losers[0].name} taper eller har for lav margin.`
          : `Disse ${Math.min(5, losers.length)} produktene taper penger eller har for lav margin.`,
      polarity: "negative",
      why: losers
        .slice(0, 5)
        .map((l) => l.name)
        .join(", "),
    });
  }

  // High revenue low profit
  const highRevLowProfit = dash.profitable
    .concat(dash.lossMaking)
    .filter((p) => p.units > 0 && p.revenue >= 500 && (p.marginPct ?? 100) < 35)
    .sort((a, b) => b.revenue - a.revenue)[0];
  if (highRevLowProfit) {
    stories.push({
      id: `rev-thin-${highRevLowProfit.productId}`,
      text: `${highRevLowProfit.name} har høy omsetning men lav fortjeneste.`,
      polarity: "negative",
      why: `Omsetning ${Math.round(highRevLowProfit.revenue)} kr · margin ${highRevLowProfit.marginPct ?? "—"} %`,
    });
  }

  const fatMargin = dash.highestMargin[0];
  if (fatMargin && (fatMargin.marginPct ?? 0) >= 45) {
    stories.push({
      id: `fat-${fatMargin.productId}`,
      text: `${fatMargin.name} gir høy margin.`,
      polarity: "positive",
      why: `Margin ~${fatMargin.marginPct} %${
        fatMargin.units > 0 ? ` · ${fatMargin.units} solgt` : " (katalog)"
      }`,
    });
  }

  // Family aggregation from catalog
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      supplierPrice: { not: null },
      OR: [{ storeId }, { storeId: null }],
    },
    select: { name: true, category: true, price: true, supplierPrice: true },
    take: 400,
  });
  const famMap = new Map<string, { label: string; margins: number[] }>();
  for (const p of products) {
    const fam = matchFamily(p.name, p.category);
    if (!fam || p.supplierPrice == null) continue;
    const m = marginPct(p.price, p.supplierPrice);
    if (m == null) continue;
    const row = famMap.get(fam) || { label: familyLabel(fam), margins: [] };
    row.margins.push(m);
    famMap.set(fam, row);
  }
  const famAvg = [...famMap.entries()]
    .map(([id, v]) => ({
      id,
      label: v.label,
      avg: round2(v.margins.reduce((a, b) => a + b, 0) / v.margins.length),
      n: v.margins.length,
    }))
    .filter((f) => f.n >= 3)
    .sort((a, b) => b.avg - a.avg);

  if (famAvg[0] && famAvg[0].avg >= 50) {
    stories.push({
      id: `fam-hi-${famAvg[0].id}`,
      text: `${famAvg[0].label} gir typisk høy margin i katalogen.`,
      polarity: "positive",
      why: `Snittmargin ~${famAvg[0].avg} % over ${famAvg[0].n} produkter`,
    });
  }
  const famLow = [...famAvg].sort((a, b) => a.avg - b.avg)[0];
  if (famLow && famLow.avg < 30) {
    stories.push({
      id: `fam-lo-${famLow.id}`,
      text: `${famLow.label} har lav snittmargin.`,
      polarity: "negative",
      why: `Snittmargin ~${famLow.avg} % over ${famLow.n} produkter`,
    });
  }

  // Pairwise: «Powerbanks gir 31 % høyere fortjeneste/margin enn gamingmus»
  if (famAvg.length >= 2) {
    const top = famAvg[0];
    const other =
      famAvg.find((f) => f.id !== top.id && top.avg - f.avg >= 8) ||
      famAvg[famAvg.length - 1];
    if (other && other.id !== top.id && other.avg > 0) {
      const lift = Math.round(((top.avg - other.avg) / other.avg) * 100);
      if (lift >= 10) {
        stories.push({
          id: `fam-compare-${top.id}-${other.id}`,
          text: `${top.label} gir ${lift} % høyere snittmargin enn ${other.label}.`,
          polarity: "positive",
          why: `${top.label} ~${top.avg} % (${top.n} stk) vs ${other.label} ~${other.avg} % (${other.n} stk)`,
        });
      }
    }
  }

  if (dash.roas != null && dash.roas < 1 && dash.adSpend > 0) {
    stories.push({
      id: "roas-low",
      text: "Annonsekronene gir ikke nok omsetning akkurat nå.",
      polarity: "negative",
      why: `ROAS ${dash.roas}x · adSpend ${dash.adSpend} kr · revenue ${dash.revenue} kr`,
    });
  }

  const memoryScore = Math.max(
    0,
    Math.min(
      100,
      40 +
        Math.min(25, winners.length * 4) +
        Math.min(15, stories.length * 3) -
        Math.min(30, losers.length * 4)
    )
  );

  const snap: FinanceMemorySnapshot = {
    version: 1,
    storeId,
    rebuiltAt: nowIso,
    lookbackDays,
    stories: stories.slice(0, 12),
    winners,
    losers,
    stats: {
      memoryScore,
      productsSeen: dash.profitable.length + dash.lossMaking.length,
      lossCount: losers.length,
      winCount: winners.length,
    },
  };
  await persist(snap);
  return snap;
}

async function persist(snap: FinanceMemorySnapshot): Promise<void> {
  await prisma.setting.upsert({
    where: { key: FINANCE_MEMORY_SETTING_KEY },
    create: {
      key: FINANCE_MEMORY_SETTING_KEY,
      value: snap as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: snap as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function getFinanceMemory(opts?: {
  storeId?: string;
  forceRebuild?: boolean;
}): Promise<FinanceMemorySnapshot> {
  const storeId = opts?.storeId || DEFAULT_STORE_ID;
  if (opts?.forceRebuild) return rebuildFinanceMemory({ storeId });

  const row = await prisma.setting.findUnique({
    where: { key: FINANCE_MEMORY_SETTING_KEY },
  });
  if (row?.value && typeof row.value === "object") {
    const snap = row.value as unknown as FinanceMemorySnapshot;
    const age = Date.now() - new Date(snap.rebuiltAt || 0).getTime();
    if (Number.isFinite(age) && age < STALE_MS && snap.version === 1) {
      return snap;
    }
  }
  return rebuildFinanceMemory({ storeId });
}
