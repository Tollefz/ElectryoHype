import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { matchFamily } from "../lib/intelligence/families";

const prisma = new PrismaClient();
const runId = "cms9g1qzh00f4vf80v7ufeq6b";

async function main() {
  const all = await prisma.buyerCandidate.findMany({
    where: { scanRunId: runId },
    select: {
      title: true,
      status: true,
      rank: true,
      shopMatchPct: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const byStatus: Record<string, number> = {};
  for (const r of all) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }

  const targets = [
    "powerbank",
    "magsafe",
    "ssd",
    "usb_c_hub",
    "usb_c_cable",
    "charger",
    "qi_charger",
    "docking_station",
    "ram",
    "gaming_mouse",
    "mouse",
    "keyboard",
    "gaming_keyboard",
    "mouse_pad",
  ];

  const targetStats: Record<
    string,
    { kept: number; filtered: number; avgMatchKept: number | null; inTop100: number; after100: number; unranked: number }
  > = {};

  for (const t of targets) {
    targetStats[t] = {
      kept: 0,
      filtered: 0,
      avgMatchKept: null,
      inTop100: 0,
      after100: 0,
      unranked: 0,
    };
  }

  const keptMatches: Record<string, number[]> = {};
  for (const r of all) {
    const fam = matchFamily(r.title || "") || "other";
    if (!targetStats[fam]) continue;
    if (r.status === "filtered") {
      targetStats[fam].filtered += 1;
    } else {
      targetStats[fam].kept += 1;
      (keptMatches[fam] ||= []).push(r.shopMatchPct);
      if (r.rank == null) targetStats[fam].unranked += 1;
      else if (r.rank <= 100) targetStats[fam].inTop100 += 1;
      else targetStats[fam].after100 += 1;
    }
  }
  for (const t of targets) {
    const xs = keptMatches[t] || [];
    targetStats[t].avgMatchKept = xs.length
      ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
      : null;
  }

  const slice = (a: typeof all) => {
    const m: Record<string, number> = {};
    for (const r of a) {
      if (r.status === "filtered") continue;
      const fam = matchFamily(r.title || "") || "other";
      m[fam] = (m[fam] || 0) + 1;
    }
    return Object.entries(m)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 10);
  };

  const n = all.length;
  const third = Math.floor(n / 3);

  // CJ contamination: MagSafe-attributed window ≈ last products when current is magsafe
  // Approximate: titles containing MagSafe vs mouse among recent kept
  const recent = all.filter((r) => r.status !== "filtered").slice(-120);
  let recentMagsafeWord = 0;
  let recentMouseWord = 0;
  let recentPowerbankWord = 0;
  for (const r of recent) {
    const t = (r.title || "").toLowerCase();
    if (/magsafe|mag\s*safe/.test(t)) recentMagsafeWord += 1;
    if (/mouse|mus/.test(t)) recentMouseWord += 1;
    if (/power\s*bank|powerbank/.test(t)) recentPowerbankWord += 1;
  }

  console.log(
    JSON.stringify(
      {
        total: n,
        byStatus,
        targetStats,
        chronologyKept: {
          firstThird: slice(all.slice(0, third)),
          midThird: slice(all.slice(third, 2 * third)),
          lastThird: slice(all.slice(2 * third)),
        },
        rankedNullRank: all.filter((r) => r.status === "ranked" && r.rank == null)
          .length,
        rankedWithRank: all.filter((r) => r.status === "ranked" && r.rank != null)
          .length,
        recent120KeptTitleSignals: {
          magsafeWord: recentMagsafeWord,
          powerbankWord: recentPowerbankWord,
          mouseWord: recentMouseWord,
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
