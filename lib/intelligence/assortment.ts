/**
 * Assortment gaps + complementary product ecosystems.
 */

import {
  COMPLEMENT_RULES,
  GAP_RULES,
  countFamilies,
  familyLabel,
} from "@/lib/intelligence/families";
import type { AssortmentGap, ComplementChain } from "@/lib/intelligence/types";

export function findAssortmentGaps(
  products: Array<{ name: string; category?: string | null }>
): AssortmentGap[] {
  const counts = countFamilies(products);
  const gaps: AssortmentGap[] = [];

  for (const rule of GAP_RULES) {
    const anchor = counts[rule.anchorFamily] || 0;
    const missing = counts[rule.missingFamily] || 0;
    if (anchor < rule.anchorMin) continue;

    const expected = Math.max(
      rule.expectedMin,
      rule.ratio ? Math.ceil(anchor * rule.ratio) : rule.expectedMin
    );
    if (missing >= expected) continue;

    const severity: AssortmentGap["severity"] =
      missing === 0 && anchor >= rule.anchorMin * 2
        ? "high"
        : missing < expected / 2
          ? "high"
          : "medium";

    gaps.push({
      id: rule.id,
      severity,
      category: null,
      anchorFamily: rule.anchorFamily,
      missingFamily: rule.missingFamily,
      anchorCount: anchor,
      missingCount: missing,
      expectedMin: expected,
      title: `${anchor}× ${familyLabel(rule.anchorFamily)} → kun ${missing}× ${familyLabel(rule.missingFamily)}`,
      why: [
        `Du har ${anchor} produkter i «${familyLabel(rule.anchorFamily)}».`,
        `Forventet minst ${expected} «${familyLabel(rule.missingFamily)}» for et komplett sortiment.`,
        missing === 0
          ? `Mangler helt — kunder som kjøper ${familyLabel(rule.anchorFamily).toLowerCase()} får ikke naturlig tilbehør.`
          : `Kun ${missing} på lager/katalog — for tynt til å støtte hovedsortimentet.`,
        `Utfyller eksisterende produkter og øker snittordreverdi.`,
      ],
      suggestedQueries: [
        familyLabel(rule.missingFamily),
        `${familyLabel(rule.anchorFamily)} ${familyLabel(rule.missingFamily)}`,
      ],
    });
  }

  return gaps.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.severity] - rank[b.severity] || b.anchorCount - a.anchorCount;
  });
}

export function buildComplementChains(
  products: Array<{ name: string; category?: string | null }>
): ComplementChain[] {
  const counts = countFamilies(products);

  return COMPLEMENT_RULES.map((rule) => {
    const steps = rule.chain.map((fam) => {
      const count = counts[fam] || 0;
      const status: "strong" | "weak" | "missing" =
        count === 0 ? "missing" : count < 3 ? "weak" : "strong";
      return {
        family: fam,
        label: familyLabel(fam),
        count,
        status,
      };
    });

    const missing = steps.filter((s) => s.status !== "strong").length;
    const why =
      missing === 0
        ? "Økosystemet er godt dekket."
        : `${missing} ledd er svake eller mangler — bygg kjeden for merkurv og bedre kundeopplevelse.`;

    return {
      id: rule.id,
      name: rule.name,
      category: rule.category,
      steps,
      why,
    };
  }).filter((c) => c.steps.some((s) => s.count > 0) || c.steps.some((s) => s.status === "missing"));
}
