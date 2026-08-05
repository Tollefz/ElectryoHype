/**
 * Investigate preference → Butikkmatch chain (read-only).
 */
import { prisma } from "../lib/prisma";
import { buildExplainableMatch } from "../lib/buyer/explainable-match";
import { classifyBuyerCandidate } from "../lib/buyer/classify-candidate";
import { toBuyerCard } from "../lib/ops/desk-buyer-groups";

function asArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

async function main() {
  const profile = await prisma.shopProfile.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  const s = (profile?.merchandiserSettings || {}) as Record<string, unknown>;
  const rules = asArr(s.adminPreferenceRules);
  console.log("=== SAVED RULES ===");
  console.log("count:", rules.length, "updated:", s.adminPreferenceUpdatedAt);
  for (const r of rules) console.log("-", r);

  const mem = await prisma.storeMemory.findFirst();
  console.log("\nlikes:", asArr(mem?.likes).length);
  console.log("dislikes:", asArr(mem?.dislikes).length);

  const prefs = {
    likes: asArr(mem?.likes),
    dislikes: asArr(mem?.dislikes),
    rules,
  };

  const needles = [
    "Rhinestone",
    "Plush Doll",
    "Magnetic Protective",
    "Phone Case",
  ];
  const cases = await prisma.buyerCandidate.findMany({
    where: {
      status: "ranked",
      OR: needles.map((n) => ({
        title: { contains: n, mode: "insensitive" as const },
      })),
    },
    take: 30,
    orderBy: { shopMatchPct: "desc" },
  });

  console.log("\n=== PHONE CASE BREAKDOWNS (with live prefs) ===");
  for (const row of cases.slice(0, 6)) {
    const pricing =
      row.pricing && typeof row.pricing === "object"
        ? (row.pricing as Record<string, unknown>)
        : {};
    const card = toBuyerCard(
      {
        id: row.id,
        title: row.title,
        imageUrl: row.imageUrl,
        supplier: row.supplier,
        supplierPrice: row.supplierPrice,
        overallScore: row.overallScore,
        shopMatchPct: row.shopMatchPct,
        shopMatchWhy: row.shopMatchWhy,
        discoveryTags: row.discoveryTags,
        risks: row.risks,
        reasons: row.reasons,
        pricing: row.pricing,
        scores: row.scores,
        snapshot: row.snapshot,
        merchandiserRecId: row.merchandiserRecId,
        rank: row.rank,
        createdAt: row.createdAt,
      },
      { prefs }
    );
    const tax = classifyBuyerCandidate(row.title || "");
    console.log("\n---", (row.title || "").slice(0, 70));
    console.log(
      `DB shopMatchPct=${Math.round(row.shopMatchPct)} overall=${Math.round(row.overallScore)}`
    );
    console.log(
      `explainPct=${card.explainPct} tax=${tax.main}>${tax.subcategory} margin=${card.marginPct} cost=${card.costNOK} retail=${card.retailNOK}`
    );
    console.log("signals:");
    for (const sig of card.explainSignals) {
      console.log(
        `  ${sig.polarity === "plus" ? "+" : sig.polarity === "minus" ? "-" : "~"} ${sig.points.toString().padStart(3)}  ${sig.id}: ${sig.label}`
      );
    }
  }

  // Which rule patterns would fire on user's actual rules?
  console.log("\n=== RULE PARSER COVERAGE ===");
  const knownPatterns = [
    { name: "margin", re: /margin|35|fortjeneste/i },
    { name: "delivery", re: /levering|dager|10\s*dag/i },
    { name: "gaming_prio", re: /gaming.*prior|prioriter.*gaming/i },
    { name: "fake_gaming", re: /ikke anbefal.*gaming|generiske.*lader.*gaming|mobillader.*gaming/i },
    { name: "cheap", re: /billig|cheap|low.?quality|ser billig/i },
  ];
  for (const rule of rules) {
    const hits = knownPatterns.filter((p) => p.re.test(rule)).map((p) => p.name);
    console.log(
      hits.length ? `MATCH [${hits.join(",")}]` : "NO PARSER MATCH",
      "→",
      rule.slice(0, 100)
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
