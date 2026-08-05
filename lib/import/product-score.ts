/**
 * AI Product Score – rates an imported product 0-10 for ElectroHypeX
 * (premium Norwegian electronics store), with a per-factor breakdown.
 *
 * Pure module – safe on server and client so the score updates live
 * when the admin edits prices.
 */

import { getDynamicMarkupPct } from "@/lib/import/pricing";
import { scoreCategoryFit } from "@/lib/import/buyer-policy";

export interface ScoreFactor {
  key: string;
  label: string;
  score: number; // 0-10
  weight: number;
  reason: string;
}

export interface ProductScore {
  overall: number; // 0-10, one decimal
  factors: ScoreFactor[];
}

export interface ProductScoreInput {
  costNOK: number;
  suggestedPrice: number;
  category: string;
  subcategory?: string | null;
  name?: string;
  originalTitle?: string;
  description?: string;
  imagesCount: number;
  variantsCount: number;
  specsCount: number;
  descriptionLength: number;
}

/** How popular each main category is in this store (heuristic). */
const CATEGORY_POPULARITY: Record<string, number> = {
  "Mobil & Tilbehør": 9,
  Gaming: 8.5,
  "Data & IT": 8.5,
  "TV, Lyd & Bilde": 7.5,
  "Hjem & Fritid": 6.5,
  Hvitevarer: 4,
};

/** How crowded/competitive each category is (higher = less competition / better). */
const CATEGORY_COMPETITION: Record<string, number> = {
  "Mobil & Tilbehør": 4.5,
  Gaming: 6,
  "Data & IT": 5.5,
  "TV, Lyd & Bilde": 6,
  "Hjem & Fritid": 5,
  Hvitevarer: 6.5,
};

/** Categories with elevated return risk (higher = lower risk). */
const RETURN_RISK: Record<string, number> = {
  "Mobil & Tilbehør": 8,
  Gaming: 7.5,
  "Data & IT": 7.5,
  "TV, Lyd & Bilde": 6.5,
  "Hjem & Fritid": 7,
  Hvitevarer: 5.5,
};

function clamp(value: number, min = 0, max = 10): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateProductScore(input: ProductScoreInput): ProductScore {
  const profit = input.suggestedPrice - input.costNOK;
  const marginPct = input.suggestedPrice > 0 ? (profit / input.suggestedPrice) * 100 : 0;
  const text = [input.name ?? "", input.originalTitle ?? "", input.description ?? ""]
    .join(" ")
    .replace(/<[^>]+>/g, " ");

  // 1. Pricing fit – market-sane bands, not max %-margin
  const actualMarkupPct = input.costNOK > 0 ? (profit / input.costNOK) * 100 : 0;
  const expectedMarkupPct = getDynamicMarkupPct(input.costNOK);
  const markupRatio = expectedMarkupPct > 0 ? actualMarkupPct / expectedMarkupPct : 0;
  const overpriced =
    input.costNOK > 0 && input.suggestedPrice > input.costNOK * 6;

  let marginScore: number;
  let marginReason: string;
  if (overpriced) {
    marginScore = 2;
    marginReason = `Urealistisk høy salgspris vs. kost (${Math.round(actualMarkupPct)} % påslag) — kunder forventer lavere norsk retail.`;
  } else if (marginPct < 25) {
    marginScore = 3;
    marginReason = `Tynn dekning etter kost (${Math.round(marginPct)} % brutto) — sjekk frakt/retur.`;
  } else if (markupRatio >= 0.85 && markupRatio <= 1.25) {
    marginScore = 10;
    marginReason = `Markedssane pris: ~${Math.round(actualMarkupPct)} % påslag, ${Math.round(marginPct)} % brutto.`;
  } else if (markupRatio >= 0.7) {
    marginScore = 8;
    marginReason = `Akseptabel pris vs. markedskurve (${Math.round(actualMarkupPct)} %).`;
  } else if (markupRatio > 1.4) {
    marginScore = 5;
    marginReason = `Høyere enn typisk markedssane band (${Math.round(actualMarkupPct)} %) — kan skade konvertering.`;
  } else {
    marginScore = 5;
    marginReason = `Pris litt under markedskurve (${Math.round(actualMarkupPct)} %).`;
  }

  // 2. Quality (images + specs + description)
  let qualityScore =
    (input.imagesCount >= 5 ? 4 : input.imagesCount >= 3 ? 3 : input.imagesCount >= 1 ? 1.5 : 0) +
    (input.specsCount >= 5 ? 3 : input.specsCount >= 3 ? 2 : input.specsCount >= 1 ? 1 : 0) +
    (input.descriptionLength > 500 ? 3 : input.descriptionLength > 250 ? 2 : input.descriptionLength > 100 ? 1 : 0);
  qualityScore = clamp(qualityScore);
  const qualityReason =
    qualityScore >= 8
      ? "Profesjonelt innhold: bilder, spesifikasjoner og beskrivelse er solide."
      : qualityScore >= 5.5
        ? "Grei kvalitet – flere bilder/spesifikasjoner ville hevet produktet."
        : "For svakt innhold for en premium elektronikkbutikk.";

  // 3. Demand (category popularity)
  const demandScore = CATEGORY_POPULARITY[input.category] ?? 5;
  const demandReason =
    demandScore >= 8
      ? `${input.category} har høy etterspørsel i sortimentet.`
      : demandScore >= 6
        ? `${input.category} har jevn etterspørsel.`
        : `${input.category} er ikke et prioritert fokus.`;

  // 4. Impulse buy
  let impulseScore: number;
  let impulseReason: string;
  if (input.suggestedPrice <= 199) {
    impulseScore = 9;
    impulseReason = `Lav pris (${Math.round(input.suggestedPrice)} kr) – høyt impulskjøp.`;
  } else if (input.suggestedPrice <= 399) {
    impulseScore = 7.5;
    impulseReason = `Pris under 400 kr gir godt impulskjøp-potensial.`;
  } else if (input.suggestedPrice <= 799) {
    impulseScore = 5;
    impulseReason = `Middels pris – kundene vurderer gjerne før kjøp.`;
  } else {
    impulseScore = 3;
    impulseReason = `Høy pris (${Math.round(input.suggestedPrice)} kr) – sjelden impulskjøp.`;
  }

  // 5. Professional appearance (gallery + clean listing signals)
  let appearanceScore =
    (input.imagesCount >= 4 ? 5 : input.imagesCount >= 2 ? 3 : 1) +
    (input.variantsCount <= 6 ? 3 : input.variantsCount <= 10 ? 1.5 : 0) +
    (input.specsCount >= 3 ? 2 : 0.5);
  appearanceScore = clamp(appearanceScore);
  const appearanceReason =
    appearanceScore >= 8
      ? "Ser ut som et produkt en moderne elektronikkforhandler ville ført."
      : appearanceScore >= 5
        ? "Akseptabelt utseende – galleri/varianter kan forbedres."
        : "Ser ikke profesjonelt nok ut for ElectroHypeX.";

  // 6. Norwegian market / store fit
  const marketFitScore = scoreCategoryFit({
    category: input.category,
    subcategory: input.subcategory,
    text,
  });
  const marketFitReason =
    marketFitScore >= 8
      ? "Sterk match mot ElectroHypeX (mobil, data, gaming, smart home, kabler/lading)."
      : marketFitScore >= 5
        ? "Delvis match – sjekk at produktet hører hjemme i sortimentet."
        : "Utenfor butikkprofilen – skal normalt ikke importeres.";

  // 7. Competition
  const competitionScore = CATEGORY_COMPETITION[input.category] ?? 5;
  const competitionReason =
    competitionScore >= 6
      ? `Moderat konkurranse i ${input.category}.`
      : `Høy konkurranse i ${input.category} – krever tydelig differensiering.`;

  // 8. Return risk
  const returnScore = RETURN_RISK[input.category] ?? 6;
  const returnReason =
    returnScore >= 7.5
      ? "Lav returrisiko for denne produkttypen."
      : returnScore >= 6
        ? "Moderat returrisiko."
        : "Forhøyet returrisiko for denne kategorien.";

  const factors: ScoreFactor[] = [
    { key: "quality", label: "Kvalitet", score: clamp(qualityScore), weight: 0.15, reason: qualityReason },
    { key: "demand", label: "Etterspørsel", score: clamp(demandScore), weight: 0.12, reason: demandReason },
    { key: "impulse", label: "Impulskjøp", score: clamp(impulseScore), weight: 0.1, reason: impulseReason },
    { key: "appearance", label: "Profesjonelt utseende", score: clamp(appearanceScore), weight: 0.12, reason: appearanceReason },
    { key: "marketFit", label: "Norsk markedstilpasning", score: clamp(marketFitScore), weight: 0.16, reason: marketFitReason },
    { key: "margin", label: "Margin", score: clamp(marginScore), weight: 0.2, reason: marginReason },
    { key: "competition", label: "Konkurranse", score: clamp(competitionScore), weight: 0.08, reason: competitionReason },
    { key: "returnRisk", label: "Returrisiko", score: clamp(returnScore), weight: 0.07, reason: returnReason },
  ];

  const overall =
    Math.round(factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0) * 10) / 10;

  return { overall: clamp(overall), factors };
}
