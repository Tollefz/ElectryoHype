import { describe, it, expect } from "vitest";
import {
  applyMarketSanityCheck,
  calculateCompareAtPrice,
  calculatePricingBreakdown,
  calculateSuggestedRetailPrice,
  convertPriceToNOK,
  estimateInboundShippingNOK,
  getDynamicMarkupPct,
  getMarginMultiplier,
  isNaturalPrice,
  NATURAL_PRICE_LADDER,
  roundToNaturalPrice,
} from "@/lib/import/pricing";
import {
  classifyMargin,
  marginTargetForLandedCost,
  retailFromTargetMargin,
  scoreMarginPotential,
} from "@/lib/buyer/margin-policy";
import { scoreMarginPillar, scoreProfit } from "@/lib/buyer/merch-brain";

describe("import pricing (målmargin)", () => {
  describe("target margin by landed cost", () => {
    it("uses higher %-mål for cheap goods and lower for expensive", () => {
      expect(marginTargetForLandedCost(30).mid).toBe(65);
      expect(marginTargetForLandedCost(80).mid).toBe(55);
      expect(marginTargetForLandedCost(200).mid).toBe(55);
      expect(marginTargetForLandedCost(400).mid).toBe(45);
      expect(marginTargetForLandedCost(800).mid).toBe(45);
    });

    it("does not price 800 kr landed at ~3–4× just because mult allowed it", () => {
      const retail = retailFromTargetMargin(800, 45);
      expect(retail).toBeLessThan(1600); // ~1455 at 45%
      expect(retail / 800).toBeLessThan(2);
    });
  });

  describe("getDynamicMarkupPct / getMarginMultiplier", () => {
    it("derives soft multipliers from målmargin — not max-margin curves", () => {
      // cheap: ~65% margin ⇒ ~2.86× on cost alone
      expect(getMarginMultiplier(24)).toBeGreaterThan(2.5);
      expect(getMarginMultiplier(24)).toBeLessThan(4.5);
      expect(getDynamicMarkupPct(24)).toBeGreaterThan(150);
    });
  });

  describe("example retail bands", () => {
    it("24 NOK supplier stays competitive (not 449)", () => {
      const p = calculateSuggestedRetailPrice(24);
      expect(p).toBeGreaterThanOrEqual(69);
      expect(p).toBeLessThanOrEqual(199);
      expect(isNaturalPrice(p)).toBe(true);
    });

    it("59 NOK supplier → competitive mid band", () => {
      const p = calculateSuggestedRetailPrice(59);
      expect(p).toBeGreaterThanOrEqual(119);
      expect(p).toBeLessThanOrEqual(249);
    });

    it("110 NOK supplier → competitive mid band", () => {
      const p = calculateSuggestedRetailPrice(110);
      expect(p).toBeGreaterThanOrEqual(199);
      expect(p).toBeLessThanOrEqual(399);
    });

    it("250 NOK supplier → not extreme markup", () => {
      const p = calculateSuggestedRetailPrice(250);
      expect(p).toBeGreaterThanOrEqual(399);
      expect(p).toBeLessThanOrEqual(799);
      expect(p / 250).toBeLessThanOrEqual(2.5);
    });

    it("500 NOK supplier → ~1.5–2× territory", () => {
      const p = calculateSuggestedRetailPrice(500);
      expect(p).toBeGreaterThanOrEqual(699);
      expect(p).toBeLessThanOrEqual(1299);
      expect(p / 500).toBeLessThanOrEqual(2.2);
    });

    it("never turns 24 NOK cost into 449 NOK sale", () => {
      expect(calculateSuggestedRetailPrice(24)).toBeLessThan(200);
    });
  });

  describe("applyMarketSanityCheck", () => {
    it("clamps absurd high prices for cheap cost", () => {
      const r = applyMarketSanityCheck(24, 449);
      expect(r.adjusted).toBe(true);
      expect(r.price).toBeLessThanOrEqual(199);
    });
  });

  describe("roundToNaturalPrice", () => {
    it("snaps to the natural ladder", () => {
      expect(roundToNaturalPrice(210)).toBe(198);
      expect(roundToNaturalPrice(220)).toBe(249);
      expect(roundToNaturalPrice(376)).toBe(399);
      expect(roundToNaturalPrice(481)).toBe(499);
      expect(roundToNaturalPrice(248)).toBe(249);
      expect(roundToNaturalPrice(503)).toBe(499);
    });

    it("includes required retail anchors", () => {
      for (const p of [198, 249, 299, 349, 399, 449, 499, 599, 699, 799, 999]) {
        expect(NATURAL_PRICE_LADDER).toContain(p);
      }
    });
  });

  describe("estimateInboundShippingNOK", () => {
    it("returns 0 when shipping is free", () => {
      expect(estimateInboundShippingNOK(100, "Gratis frakt")).toBe(0);
      expect(estimateInboundShippingNOK(100, "Free shipping")).toBe(0);
    });

    it("uses modest tiered defaults", () => {
      expect(estimateInboundShippingNOK(50)).toBe(19);
      expect(estimateInboundShippingNOK(120)).toBe(29);
      expect(estimateInboundShippingNOK(300)).toBe(39);
    });
  });

  describe("calculateSuggestedRetailPrice", () => {
    it("uses målmargin and natural rounding", () => {
      const price = calculateSuggestedRetailPrice(80);
      expect(isNaturalPrice(price)).toBe(true);
      expect(price).toBeGreaterThan(80);
      expect(price).toBeLessThanOrEqual(299);
    });

    it("respects product margin policy when provided (still sanity-clamped)", () => {
      const price = calculateSuggestedRetailPrice(100, {
        profitMargin: "100%",
        shippingEstimate: "Gratis frakt",
      });
      expect(isNaturalPrice(price)).toBe(true);
      expect(price).toBeLessThanOrEqual(399);
    });
  });

  describe("calculatePricingBreakdown", () => {
    it("exposes margin and shipping for reports", () => {
      const b = calculatePricingBreakdown(100, { shippingEstimate: "5-12 dager" });
      expect(b.inboundShipping).toBe(29);
      expect(b.landedCost).toBe(129);
      expect(isNaturalPrice(b.sellingPrice)).toBe(true);
      expect(b.marginPct).toBeGreaterThan(0);
      expect(b.sellingPrice).toBeLessThanOrEqual(499);
      expect(b.policy).toMatch(/målmargin/i);
    });
  });

  describe("convertPriceToNOK", () => {
    it("converts USD to NOK", () => {
      expect(convertPriceToNOK(10, "USD")).toBe(105);
    });

    it("keeps NOK as-is", () => {
      expect(convertPriceToNOK(24, "NOK")).toBe(24);
    });
  });

  describe("calculateCompareAtPrice", () => {
    it("adds markup and snaps to natural ladder", () => {
      expect(isNaturalPrice(calculateCompareAtPrice(249))).toBe(true);
    });
  });
});

describe("margin scoring prefers healthy over extreme", () => {
  it("classifyMargin marks >70% as extreme", () => {
    expect(classifyMargin(50)).toBe("strong");
    expect(classifyMargin(75)).toBe("extreme");
  });

  it("scoreMarginPotential peaks near 50%, not 90%", () => {
    const healthy = scoreMarginPotential(50);
    const extreme = scoreMarginPotential(85);
    expect(healthy).toBeGreaterThan(extreme);
    expect(healthy).toBeGreaterThan(80);
    expect(extreme).toBeLessThan(45);
  });

  it("scoreMarginPillar does not reward extreme markup", () => {
    const healthy = scoreMarginPillar(48, "gaming", "Headset");
    const extreme = scoreMarginPillar(85, "gaming", "Headset");
    expect(healthy).toBeGreaterThan(extreme);
  });

  it("scoreProfit caps when margin is extreme", () => {
    const healthy = scoreProfit({ profitNOK: 400, marginPct: 48 });
    const extreme = scoreProfit({ profitNOK: 400, marginPct: 82 });
    expect(healthy).toBeGreaterThanOrEqual(extreme);
    expect(extreme).toBeLessThanOrEqual(68);
  });
});
