/**
 * AI Quality Gate — autonomous filter with confidence + explanations.
 * Composes existing buyer/completeness signals; does not duplicate pipeline logic.
 */

import { getAllDbValues } from "@/lib/categories";
import type {
  AutonomyQualityThresholds,
  ConfidenceMap,
  ExplainedDecision,
} from "@/lib/autonomy/types";

export type QualityGateInput = {
  title: string;
  category: string | null;
  imageCount: number;
  specCount: number;
  marginPct: number | null;
  merchandiserScore: number | null;
  hasSuspiciousContent?: boolean;
  supplierScore?: number | null;
  completenessScore?: number | null;
  aiCategoryConfidence?: number | null;
  descriptionLength?: number;
};

export type QualityGateResult = {
  passed: boolean;
  confidence: ConfidenceMap;
  decision: ExplainedDecision;
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function runAutonomyQualityGate(
  input: QualityGateInput,
  thresholds: AutonomyQualityThresholds
): QualityGateResult {
  const known = getAllDbValues();
  const why: string[] = [];
  const risks: string[] = [];
  let reject = false;

  const categoryKnown = Boolean(
    input.category && known.includes(input.category)
  );
  const categoryConf = clamp(
    input.aiCategoryConfidence ??
      (categoryKnown ? 90 : input.category ? 55 : 20)
  );

  if (thresholds.requireKnownCategory && !categoryKnown) {
    reject = true;
    why.push("Ukjent eller manglende kategori");
    risks.push("Kan havne feil i butikkstrukturen");
  } else if (categoryConf < thresholds.minCategoryConfidence) {
    reject = true;
    why.push(`Lav kategorikonfidens (${categoryConf}%)`);
  } else {
    why.push(`Kategori OK (${input.category || "—"}) · ${categoryConf}%`);
  }

  if (input.imageCount < thresholds.minImages) {
    reject = true;
    why.push(`For få bilder (${input.imageCount} < ${thresholds.minImages})`);
    risks.push("Svak visuell presentasjon");
  } else {
    why.push(`${input.imageCount} bilder — over terskel`);
  }

  if (input.specCount < thresholds.minSpecs) {
    reject = true;
    why.push(`Manglende spesifikasjoner (${input.specCount} < ${thresholds.minSpecs})`);
  } else {
    why.push(`${input.specCount} specs`);
  }

  const marginConf =
    input.marginPct == null
      ? 40
      : clamp(50 + input.marginPct);
  if (input.marginPct != null && input.marginPct < thresholds.minMarginPct) {
    reject = true;
    why.push(
      `For lav margin (${Math.round(input.marginPct)}% < ${thresholds.minMarginPct}%)`
    );
    risks.push("Svak lønnsomhet");
  } else if (input.marginPct != null) {
    why.push(`Margin ~${Math.round(input.marginPct)}%`);
  } else {
    risks.push("Margin ikke beregnet — usikkerhet");
  }

  const merch = input.merchandiserScore;
  if (merch != null && merch < thresholds.minMerchandiserScore) {
    reject = true;
    why.push(
      `Merchandiser-score ${Math.round(merch)} under terskel ${thresholds.minMerchandiserScore}`
    );
  } else if (merch != null) {
    why.push(`Merchandiser-score ${Math.round(merch)}`);
  }

  if (input.hasSuspiciousContent) {
    reject = true;
    why.push("Mistenkelig innhold oppdaget");
    risks.push("Mulig policy-/kvalitetsbrudd");
  }

  if (input.supplierScore != null && input.supplierScore < 40) {
    reject = true;
    why.push(`Lav leverandørscore (${input.supplierScore})`);
  }

  const descLen = input.descriptionLength ?? 0;
  const descriptionConf = clamp(descLen < 40 ? 35 : descLen < 120 ? 70 : 95);
  const seoConf = clamp(
    (input.completenessScore ?? 70) * 0.6 + descriptionConf * 0.4
  );
  const priceConf = clamp(marginConf);
  const importConf = clamp(
    (merch ?? 70) * 0.4 +
      (input.imageCount >= 3 ? 25 : 10) +
      (categoryKnown ? 20 : 0) +
      (input.specCount >= 2 ? 15 : 0)
  );

  const confidence: ConfidenceMap = {
    category: categoryConf,
    price: priceConf,
    description: descriptionConf,
    seo: seoConf,
    margin: marginConf,
    import: importConf,
    overall: clamp(
      (categoryConf + priceConf + descriptionConf + seoConf + marginConf + importConf) /
        6
    ),
  };

  if (confidence.overall < thresholds.minOverallConfidence) {
    reject = true;
    why.push(
      `Samlet confidence ${confidence.overall}% under terskel ${thresholds.minOverallConfidence}%`
    );
  }

  if (!reject) {
    why.unshift("Bestod Quality Gate");
  }

  return {
    passed: !reject,
    confidence,
    decision: {
      stage: "quality_gate",
      subjectKey: input.title.slice(0, 120),
      action: reject ? "reject" : "accept",
      confidence: confidence.overall,
      why,
      risks,
      confidenceMap: confidence,
      data: {
        imageCount: input.imageCount,
        specCount: input.specCount,
        marginPct: input.marginPct,
        merchandiserScore: merch,
        category: input.category,
      },
    },
  };
}
