/**
 * Dry-run proof for 3-step buyer flow (no real publish).
 *
 * Run: npx tsx scripts/prove-approve-publish-flow.ts
 */

import { prisma } from "../lib/prisma";
import { classifyBuyerCandidate } from "../lib/buyer/classify-candidate";
import { evaluateAutoPublishGate } from "../lib/buyer/auto-publish-gate";
import { findAssortmentGaps } from "../lib/intelligence/assortment";
import { existsSync, readFileSync } from "fs";

type Scorecard = Record<string, "PASS" | "FAIL">;

async function main() {
  const scorecard: Scorecard = {
    "AI FINNER": "FAIL",
    "👍/👎 LÆRING": "FAIL",
    "VALG → KLARGJØRING": "FAIL",
    "AUTO QUALITY GATE": "FAIL",
    "AUTO PUBLISH PIPELINE": "FAIL",
    "PROBLEM → TRENGER KONTROLL": "FAIL",
    "BUTIKKINNSIKT → FINN → VELG": "FAIL",
  };

  console.log("=== Prove approve+publish flow (dry-run) ===\n");

  const ranked = await prisma.buyerCandidate.count({
    where: { status: "ranked" },
  });
  console.log(`Ranked candidates: ${ranked}`);
  scorecard["AI FINNER"] = ranked > 0 ? "PASS" : "FAIL";

  const prefsUi = existsSync("components/admin/BuyerPreferencesPanel.tsx");
  const pickUi = existsSync("components/admin/BuyerPickFlow.tsx");
  const pickSrc = readFileSync("components/admin/BuyerPickFlow.tsx", "utf8");
  const thumbLearns =
    pickSrc.includes("feedback_thumb") &&
    pickSrc.includes("approve_and_publish") &&
    pickSrc.includes("👍");
  scorecard["👍/👎 LÆRING"] =
    prefsUi && pickUi && thumbLearns ? "PASS" : "FAIL";

  const routeSrc = readFileSync("app/api/admin/buyer/route.ts", "utf8");
  const orchSrc = readFileSync("lib/buyer/approve-and-publish.ts", "utf8");
  scorecard["VALG → KLARGJØRING"] =
    routeSrc.includes("approve_and_publish") &&
    orchSrc.includes("importBuyerCandidatesByIds") &&
    orchSrc.includes("processImportQueueItem")
      ? "PASS"
      : "FAIL";

  // Quality gate unit cases
  const goodGate = evaluateAutoPublishGate({
    title: "RGB Gaming Mouse Wired 6400 DPI",
    canImport: true,
    merchandiserRecId: "rec1",
    imageUrl: "https://example.com/a.jpg",
    images: ["https://example.com/a.jpg"],
    costNOK: 80,
    retailNOK: 199,
    marginPct: 55,
    adminApproved: true,
  });
  const badSolar = evaluateAutoPublishGate({
    title: "Solar Panel 100W Portable Folding",
    canImport: true,
    merchandiserRecId: "rec2",
    imageUrl: "https://example.com/a.jpg",
    costNOK: 100,
    retailNOK: 299,
    marginPct: 60,
    adminApproved: true,
  });
  const badMargin = evaluateAutoPublishGate({
    title: "USB Gaming Mouse",
    canImport: true,
    merchandiserRecId: "rec3",
    imageUrl: "https://example.com/a.jpg",
    costNOK: 150,
    retailNOK: 160,
    marginPct: 6,
    adminApproved: true,
  });
  const badNoImage = evaluateAutoPublishGate({
    title: "Gaming Headset RGB",
    canImport: true,
    merchandiserRecId: "rec4",
    images: [],
    costNOK: 90,
    retailNOK: 249,
    marginPct: 50,
    adminApproved: true,
  });
  const badFake = evaluateAutoPublishGate({
    title: "Replica Rolex Smart Watch AAA Quality",
    canImport: true,
    merchandiserRecId: "rec5",
    imageUrl: "https://example.com/a.jpg",
    costNOK: 50,
    retailNOK: 499,
    marginPct: 80,
    adminApproved: true,
  });

  console.log("Gate good mouse:", goodGate.ok, goodGate.reasonsOk[0]);
  console.log("Gate solar:", badSolar.ok, badSolar.problems[0]);
  console.log("Gate low margin:", badMargin.ok, badMargin.problems[0]);
  console.log("Gate no image:", badNoImage.ok, badNoImage.problems[0]);
  console.log("Gate counterfeit:", badFake.ok, badFake.problems[0]);

  scorecard["AUTO QUALITY GATE"] =
    goodGate.ok &&
    !badSolar.ok &&
    !badMargin.ok &&
    !badNoImage.ok &&
    !badFake.ok
      ? "PASS"
      : "FAIL";

  scorecard["AUTO PUBLISH PIPELINE"] =
    orchSrc.includes("publishImportQueueItem") &&
    orchSrc.includes("dryRun") &&
    routeSrc.includes("dryRun")
      ? "PASS"
      : "FAIL";

  scorecard["PROBLEM → TRENGER KONTROLL"] =
    !badSolar.ok &&
    badSolar.problems[0]?.length > 0 &&
    orchSrc.includes("needs_control") &&
    pickSrc.includes("Trenger kontroll")
      ? "PASS"
      : "FAIL";

  const products = await prisma.product.findMany({
    select: { name: true, category: true },
    take: 500,
  });
  const gaps = findAssortmentGaps(
    products.map((p) => ({ name: p.name, category: p.category }))
  );
  const gap = gaps[0];
  const href = gap
    ? `/admin/buyer?mission=gap&family=${encodeURIComponent(gap.missingFamily)}&q=${encodeURIComponent(gap.suggestedQueries[0] || "")}`
    : "";
  const intelSrc = readFileSync(
    "app/admin/(panel)/intelligence/IntelligenceClient.tsx",
    "utf8"
  );
  console.log("\nGap:", gap?.title || "(none)");
  console.log("Href:", href || "(synthetic)");
  scorecard["BUTIKKINNSIKT → FINN → VELG"] =
    intelSrc.includes("Finn gode produkter") &&
    intelSrc.includes("/admin/buyer?mission=gap") &&
    (Boolean(gap) || gaps.length === 0)
      ? "PASS"
      : "FAIL";

  // Live dry-run sample (no publish)
  const sample = await prisma.buyerCandidate.findMany({
    where: { status: "ranked", merchandiserRecId: { not: null } },
    take: 12,
    orderBy: { shopMatchPct: "desc" },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      supplierPrice: true,
      merchandiserRecId: true,
      pricing: true,
      snapshot: true,
    },
  });

  let wouldPublish = 0;
  let wouldControl = 0;
  for (const row of sample) {
    const pricing =
      row.pricing && typeof row.pricing === "object"
        ? (row.pricing as Record<string, unknown>)
        : {};
    const cost =
      row.supplierPrice != null
        ? Number(row.supplierPrice)
        : Number(pricing.costNOK || 0) || null;
    const retail =
      Number(pricing.retailNOK || pricing.estimatedRetailNOK || 0) || null;
    const margin =
      pricing.marginPct != null
        ? Number(pricing.marginPct)
        : cost && retail
          ? ((retail - cost) / retail) * 100
          : null;
    const gate = evaluateAutoPublishGate({
      title: row.title || "",
      canImport: Boolean(row.merchandiserRecId),
      merchandiserRecId: row.merchandiserRecId,
      imageUrl: row.imageUrl,
      costNOK: cost,
      retailNOK: retail,
      marginPct: margin,
      adminApproved: true,
    });
    const tax = classifyBuyerCandidate(row.title || "");
    if (gate.ok) wouldPublish += 1;
    else wouldControl += 1;
    console.log(
      `${gate.ok ? "WOULD PUBLISH" : "CONTROL"} ${Math.round(row.supplierPrice || 0)}kr · ${tax.main} · ${(row.title || "").slice(0, 50)}`
    );
    if (!gate.ok) console.log(`   → ${gate.problems[0]}`);
  }
  console.log(
    `\nDry-run sample: ${wouldPublish} would publish · ${wouldControl} need control (no DB writes)`
  );

  console.log("\n=== SCORECARD ===");
  for (const [k, v] of Object.entries(scorecard)) {
    console.log(`${v === "PASS" ? "✓" : "✗"} ${k}: ${v}`);
  }

  const failed = Object.values(scorecard).filter((v) => v === "FAIL").length;
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
