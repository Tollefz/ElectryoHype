/**
 * Prove merchandiser pricing is psychological, not flat markup.
 * npx tsx scripts/prove-merchandiser-pricing.ts
 */

import { estimateMerchandiserPricing } from "../lib/suppliers/merchandiser/pricing-advice";
import { inferPricingPreferences } from "../lib/buyer/price-learning";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const cost109 = estimateMerchandiserPricing({
  supplierPrice: 109,
  currency: "NOK",
  category: "Gamingmus",
  title: "Professional Gaming Mouse",
});

console.log("cost 109 →", cost109.estimatedRetailNOK, cost109.reasons);

assert(
  Number.isInteger(cost109.estimatedRetailNOK),
  "Retail must be integer kr"
);
assert(
  ![147, 147.15, 146].includes(cost109.estimatedRetailNOK),
  "Must not be raw markup like 147.15"
);
assert(
  cost109.estimatedRetailNOK % 1 === 0 &&
    (cost109.estimatedRetailNOK % 10 === 9 ||
      cost109.estimatedRetailNOK % 10 === 8 ||
      cost109.estimatedRetailNOK % 10 === 0),
  "Should land on natural Norwegian price"
);

const learned = inferPricingPreferences({
  rules: [
    "Når produkter er mellom 399–699 kr, velger jeg nesten alltid den nest billigste markedsprisen.",
    "På gamingmus liker jeg 35–45 % margin.",
  ],
});
assert(learned.preferSecondCheapestInBand, "Should learn nest billigste");
assert(learned.preferredBand?.min === 399, "Preferred band 399–699");

const withLearn = estimateMerchandiserPricing({
  supplierPrice: 180,
  currency: "NOK",
  category: "Gaming",
  title: "Gaming Mouse RGB",
  preferenceRules: [
    "Når produkter er mellom 399–699 kr, velger jeg nesten alltid den nest billigste markedsprisen.",
  ],
});
console.log("learned pricing", withLearn.estimatedRetailNOK, withLearn.confidence);
assert(
  (withLearn.reasons || []).some((r) => /nest billigste|Markedsbånd|Psykologisk/i.test(r.label)),
  "Should expose price reasons"
);

console.log("\n✓ MERCHANDISER PRICING: PASS");
console.log("✓ PSYCHOLOGICAL LADDER: PASS");
console.log("✓ PRICE LEARNING HINTS: PASS");
console.log("✓ PRICE REASONS: PASS");
