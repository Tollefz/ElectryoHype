import { prisma } from "../lib/prisma";
import { buildExplainableMatch } from "../lib/buyer/explainable-match";

async function main() {
  const profile = await prisma.shopProfile.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  const s = (profile?.merchandiserSettings || {}) as Record<string, unknown>;
  const rules = Array.isArray(s.adminPreferenceRules)
    ? s.adminPreferenceRules.map(String)
    : [];
  const mem = await prisma.storeMemory.findFirst();
  const likes = Array.isArray(mem?.likes) ? mem!.likes.map(String) : [];
  const dislikes = Array.isArray(mem?.dislikes)
    ? mem!.dislikes.map(String)
    : [];

  const needles = [
    "Transparent Rhinestone Mirror Bowknot",
    "Plush Doll Phone Case Cute Cartoon",
    "Applicable Phone Case Technology Magnetic",
  ];

  for (const n of needles) {
    const row = await prisma.buyerCandidate.findFirst({
      where: {
        status: "ranked",
        title: { contains: n.slice(0, 24), mode: "insensitive" },
      },
    });
    const title = row?.title || n;
    const pricing =
      row?.pricing && typeof row.pricing === "object"
        ? (row.pricing as Record<string, unknown>)
        : {};
    const margin = Number(pricing.marginPct ?? 70);
    const shop = row?.shopMatchPct ?? 88;
    const empty = buildExplainableMatch({
      title,
      shopMatchPct: shop,
      marginPct: margin,
      deliveryHint: "Ca. 8 dager",
      prefs: { likes: [], dislikes: [], rules: [] },
    });
    const live = buildExplainableMatch({
      title,
      shopMatchPct: shop,
      marginPct: margin,
      deliveryHint: "Ca. 8 dager",
      prefs: {
        likes,
        dislikes,
        rules,
        familyCounts: { phone_case: 40 },
        poolSize: 300,
      },
    });
    console.log("\n" + title.slice(0, 72));
    console.log(
      `FOUND=${Boolean(row)} DB=${row ? Math.round(row.shopMatchPct) : "n/a"} BEFORE=${empty.pct}% AFTER=${live.pct}% storeRel=${live.storeRelevance}`
    );
    for (const s of live.signals.filter((x) => x.polarity !== "neutral").slice(0, 6)) {
      console.log(
        `  ${s.polarity === "plus" ? "+" : "−"} ${s.label} (${s.points})`
      );
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
