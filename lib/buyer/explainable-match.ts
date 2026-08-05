/**
 * Explainable Butikkmatch — NARRATIVE ONLY for the product card.
 *
 * Persisted ranking truth is `computeShopMatch` (scan) + Merch Brain (butikkscore).
 * Do not use `explainPct` as a competing sort key.
 */

import { classifyBuyerCandidate, formatTaxonomyPath } from "@/lib/buyer/classify-candidate";
import {
  applyRelevanceCap,
  evaluatePreferenceImpact,
  parsePreferenceRules,
} from "@/lib/buyer/preference-signals";

export type MatchSignal = {
  id: string;
  polarity: "plus" | "minus" | "neutral";
  label: string;
  points: number;
};

export type ExplainableMatch = {
  pct: number;
  taxonomyPath: string;
  main: string;
  subcategory: string | null;
  fitsElectroHype: boolean;
  signals: MatchSignal[];
  summary: string;
  storeRelevance: number;
  capped: boolean;
  breakdown: Array<{ component: string; points: number }>;
};

export type PreferenceContext = {
  likes: string[];
  dislikes: string[];
  rules: string[];
  familyCounts?: Record<string, number>;
  poolSize?: number;
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function daysFromDelivery(hint: string | null | undefined): number | null {
  if (!hint) return null;
  const m = hint.match(/(\d+)\s*[-–]?\s*(\d+)?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  if (!Number.isFinite(a)) return null;
  return Math.round((a + (Number.isFinite(b) ? b : a)) / 2);
}

/**
 * Build explainable match from candidate fields + admin preferences.
 */
export function buildExplainableMatch(input: {
  title: string;
  shopMatchPct?: number | null;
  marginPct?: number | null;
  deliveryHint?: string | null;
  supplierPrice?: number | null;
  retailNOK?: number | null;
  prefs?: PreferenceContext | null;
  gapFamily?: string | null;
}): ExplainableMatch {
  const taxonomy = classifyBuyerCandidate(input.title);
  const signals: MatchSignal[] = [];
  const breakdown: Array<{ component: string; points: number }> = [];
  let score = 40;

  // --- STORE / CATEGORY FIT (primary) ---
  if (!taxonomy.fitsElectroHype) {
    signals.push({
      id: "off",
      polarity: "minus",
      label: taxonomy.rejectReason || "Passer ikke ElectroHype",
      points: -35,
    });
    score -= 35;
    breakdown.push({ component: "Category fit", points: -35 });
  } else {
    signals.push({
      id: "tax",
      polarity: "plus",
      label: `Kategori: ${formatTaxonomyPath(taxonomy)}`,
      points: 10,
    });
    score += 10;
    breakdown.push({ component: "Category fit", points: 10 });
  }

  const prefs = input.prefs;
  const impact = evaluatePreferenceImpact({
    title: input.title,
    categoryHint: taxonomy.main,
    rules: prefs?.rules || [],
    likes: prefs?.likes || [],
    dislikes: prefs?.dislikes || [],
    familyCounts: prefs?.familyCounts,
    poolSize: prefs?.poolSize,
  });

  for (const s of impact.signals) {
    signals.push(s);
    score += s.points;
  }
  breakdown.push({
    component: "Store preferences / learning",
    points: impact.signals.reduce((a, s) => a + s.points, 0),
  });

  const storeRelevance = impact.storeRelevance;

  signals.push({
    id: "store_rel",
    polarity:
      storeRelevance >= 55 ? "plus" : storeRelevance < 40 ? "minus" : "neutral",
    label: `Butikkrelevans ${storeRelevance}%`,
    points: 0,
  });

  // Gap fill (assortment need)
  if (input.gapFamily) {
    const g = input.gapFamily.toLowerCase();
    const hit =
      taxonomy.subcategory?.toLowerCase().includes(g.slice(0, 6)) ||
      input.title.toLowerCase().includes(g.slice(0, 6));
    if (hit) {
      signals.push({
        id: "gap",
        polarity: "plus",
        label: `Fyller sortimentshull (${input.gapFamily})`,
        points: 12,
      });
      score += 12;
      breakdown.push({ component: "Assortment need", points: 12 });
    }
  }

  // Scan quality — limited influence; cannot dominate
  const base = Number(input.shopMatchPct);
  if (Number.isFinite(base)) {
    let adj = Math.round((base - 50) * 0.2);
    if (storeRelevance < 40) adj = Math.min(adj, 4);
    signals.push({
      id: "base",
      polarity: adj >= 0 ? "plus" : "minus",
      label: `Scan-kvalitet ${Math.round(base)}%`,
      points: adj,
    });
    score += adj;
    breakdown.push({ component: "Scan quality", points: adj });
  }

  // Delivery
  const days = daysFromDelivery(input.deliveryHint);
  if (days != null) {
    const deliveryBase = days <= 10 ? 8 : days <= 14 ? 2 : -8;
    const wantsFast = (prefs?.rules || []).some((r) =>
      /levering|under\s*10|10\s*dag/i.test(r)
    );
    let ruleAdj = 0;
    if (wantsFast && days <= 10) ruleAdj = 4;
    if (wantsFast && days > 10) ruleAdj = -4;

    signals.push({
      id: deliveryBase >= 0 ? "ship_fast" : "ship_slow",
      polarity:
        deliveryBase > 2 ? "plus" : deliveryBase < 0 ? "minus" : "neutral",
      label:
        deliveryBase < 0
          ? `Lang levering (~${days} dager)`
          : `Levering ca. ${days} dager`,
      points: deliveryBase,
    });
    if (ruleAdj > 0) {
      signals.push({
        id: "rule_ship",
        polarity: "plus",
        label: "Matcher din leveringsregel",
        points: ruleAdj,
      });
    } else if (ruleAdj < 0) {
      signals.push({
        id: "rule_ship_fail",
        polarity: "minus",
        label: "Bryter din leveringsregel",
        points: ruleAdj,
      });
    }
    score += deliveryBase + ruleAdj;
    breakdown.push({ component: "Delivery", points: deliveryBase + ruleAdj });
  }

  // Margin — important but CANNOT rescue low store relevance
  const margin = input.marginPct;
  if (margin != null && Number.isFinite(margin)) {
    let baseMargin = margin >= 35 ? 8 : margin >= 25 ? 3 : -10;
    const wantsMargin = (prefs?.rules || []).some((r) =>
      /margin|fortjeneste/i.test(r)
    );
    let ruleAdj = 0;
    if (wantsMargin && margin >= 35) ruleAdj = 3;
    if (wantsMargin && margin < 35) ruleAdj = -4;

    if (storeRelevance < 40) {
      baseMargin = Math.min(baseMargin, 2);
      ruleAdj = Math.min(ruleAdj, 0);
      signals.push({
        id: "margin_capped",
        polarity: "neutral",
        label: `Margin ${Math.round(margin)}% — begrenset effekt (lav relevans)`,
        points: baseMargin,
      });
    } else {
      signals.push({
        id: baseMargin >= 0 ? "margin_good" : "margin_low",
        polarity: baseMargin > 2 ? "plus" : baseMargin < 0 ? "minus" : "neutral",
        label:
          baseMargin < 0
            ? `Lav margin (${Math.round(margin)}%)`
            : `Margin ${Math.round(margin)}%`,
        points: baseMargin,
      });
      if (ruleAdj > 0) {
        signals.push({
          id: "rule_margin",
          polarity: "plus",
          label: "Matcher din marginregel",
          points: ruleAdj,
        });
      } else if (ruleAdj < 0) {
        signals.push({
          id: "rule_margin_fail",
          polarity: "minus",
          label: "Bryter din marginregel",
          points: ruleAdj,
        });
      }
    }

    score += baseMargin + ruleAdj;
    breakdown.push({ component: "Margin", points: baseMargin + ruleAdj });
  }

  // Soft: serious electronics identity (Komplett/Elkjøp style) — from parsed rules
  const parsed = parsePreferenceRules(prefs?.rules || []);
  const wantsSerious = parsed.some(
    (r) =>
      /komplett|elkjøp|seriøs/i.test(r.raw) && r.intent !== "deprioritize"
  );
  if (wantsSerious) {
    const toyish =
      /\b(plush|doll|cute|cartoon|rhinestone|bowknot|toy|pynte|leketøy)\b/i.test(
        input.title
      );
    if (toyish) {
      signals.push({
        id: "serious_fail",
        polarity: "minus",
        label: "Passer dårlig i seriøs elektronikkprofil",
        points: -14,
      });
      score -= 14;
      breakdown.push({ component: "Store identity", points: -14 });
    }
  }

  const { pct, capped, capReason } = applyRelevanceCap(score, storeRelevance);
  if (capped && capReason) {
    signals.push({
      id: "rel_cap",
      polarity: "minus",
      label: capReason,
      points: 0,
    });
  }

  const summary =
    signals
      .filter((s) => s.polarity !== "neutral")
      .slice(0, 4)
      .map((s) => `${s.polarity === "plus" ? "+" : "−"} ${s.label}`)
      .join(" · ") || "Begrenset signalgrunnlag";

  return {
    pct,
    taxonomyPath: formatTaxonomyPath(taxonomy),
    main: taxonomy.main,
    subcategory: taxonomy.subcategory,
    fitsElectroHype: taxonomy.fitsElectroHype,
    signals: signals
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
      .slice(0, 10),
    summary,
    storeRelevance,
    capped,
    breakdown,
  };
}

/** Preference delta only — for ranking comparisons in tests/UI. */
export function preferenceRankDelta(
  title: string,
  prefs: PreferenceContext,
  extras?: { marginPct?: number | null; deliveryHint?: string | null }
): number {
  const m = buildExplainableMatch({
    title,
    marginPct: extras?.marginPct,
    deliveryHint: extras?.deliveryHint,
    prefs,
  });
  return m.signals
    .filter(
      (s) =>
        s.id.startsWith("pref_") ||
        s.id.startsWith("liked") ||
        s.id.startsWith("disliked") ||
        s.id.startsWith("sat_")
    )
    .reduce((a, s) => a + s.points, 0);
}
