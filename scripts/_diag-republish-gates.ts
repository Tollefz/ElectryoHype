/**
 * Diagnose republish board: pricing fill + Quality Gate breakdown.
 * Usage: npx tsx -r ./scripts/stub-server-only.ts scripts/_diag-republish-gates.ts
 */
import {
  fillMissingCandidatePricing,
  getRepublishBoard,
} from "../lib/buyer/republish";

async function main() {
  const mode = process.argv[2] || "board";

  if (mode === "fill") {
    console.log("=== Pricing fill ===");
    const result = await fillMissingCandidatePricing({ limit: 3000 });
    console.log(JSON.stringify(result, null, 2));
  }

  console.log("=== Board ===");
  const board = await getRepublishBoard({ status: "all", limit: 5 });
  const s = board.summary;
  console.log(
    JSON.stringify(
      {
        total: s.total,
        ready: s.ready,
        failGate: s.failGate,
        published: s.published,
        sum: s.ready + s.failGate + s.published,
        pricingOk: s.pricingOk,
        scoped: s.scopedToPublishJob,
        coarse: {
          failPricing: s.failPricing,
          failFreight: s.failFreight,
          failMargin: s.failMargin,
          failQuality: s.failQuality,
        },
        gateReasons: s.gateReasons,
        failGateFromReasons: Object.entries(s.gateReasons)
          .filter(([k]) => k !== "ready" && k !== "already_published")
          .reduce((a, [, n]) => a + n, 0),
        readyIdsSample: board.readyIds.slice(0, 3),
      },
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
