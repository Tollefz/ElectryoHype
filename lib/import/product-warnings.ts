/**
 * Product warning detection for imported products.
 *
 * Flags likely problems (low margin, trademark issues, weak content etc.)
 * so the admin can fix them before publishing.
 *
 * Pure module – safe to use on both server and client.
 */

import { looksLikeThumbnail } from "@/lib/import/image-quality";
import { getDynamicMarkupPct } from "@/lib/import/pricing";
import {
  BUYER_APPROVED_SCORE,
  BUYER_MIN_GROSS_MARGIN_PCT,
  BUYER_REVIEW_MIN_SCORE,
  detectAbsoluteReject,
  evaluateBuyerFit,
} from "@/lib/import/buyer-policy";
import { calculateProductScore } from "@/lib/import/product-score";
import { isTemuFallbackSupplierCost } from "@/lib/scrapers/temu-price";

export type WarningSeverity = "critical" | "warning" | "info";

export interface ProductWarning {
  code: string;
  severity: WarningSeverity;
  message: string;
}

export interface ProductWarningInput {
  name: string;
  description: string;
  originalTitle: string;
  costNOK: number;
  suggestedPrice: number;
  category?: string;
  subcategory?: string | null;
  images: string[];
  variants: Array<{ name: string; attributes?: Record<string, string> }>;
  specs: Record<string, string>;
}

/** Well-known trademarks that often cause listing/IP problems. */
const TRADEMARK_TERMS = [
  "disney",
  "marvel",
  "pokemon",
  "pokémon",
  "hello kitty",
  "lego",
  "nintendo",
  "star wars",
  "harry potter",
  "barbie",
  "nike",
  "adidas",
  "gucci",
  "louis vuitton",
  "chanel",
  "rolex",
  "supreme",
  "mickey",
  "minions",
  "spiderman",
  "spider-man",
  "batman",
  "superman",
];

/** Suspicious phrases often found in low-quality supplier descriptions. */
const SUSPICIOUS_PHRASES = [
  "100% original",
  "aaa quality",
  "replica",
  "kopi av",
  "1:1 quality",
  "best quality guarantee",
  "factory direct",
];

export function detectProductWarnings(input: ProductWarningInput): ProductWarning[] {
  const warnings: ProductWarning[] = [];
  const profit = input.suggestedPrice - input.costNOK;
  const grossMarginPct =
    input.suggestedPrice > 0 ? (profit / input.suggestedPrice) * 100 : 0;

  // Margin – absolute buyer floor (50 % gross) + curve-relative guidance
  const actualMarkupPct = input.costNOK > 0 ? (profit / input.costNOK) * 100 : 0;
  const expectedMarkupPct = getDynamicMarkupPct(input.costNOK);
  const markupRatio = expectedMarkupPct > 0 ? actualMarkupPct / expectedMarkupPct : 0;

  if (grossMarginPct < BUYER_MIN_GROSS_MARGIN_PCT) {
    warnings.push({
      code: "below-buyer-margin",
      severity: "warning",
      message: `Bruttomargin ${Math.round(grossMarginPct)} % er under anbefalt ${BUYER_MIN_GROSS_MARGIN_PCT} %. Vurder manuelt før import.`,
    });
  } else if (markupRatio < 0.75) {
    warnings.push({
      code: "low-margin",
      severity: "warning",
      message: `Påslag under priskurven (${Math.round(actualMarkupPct)} % mot ~${Math.round(expectedMarkupPct)} %).`,
    });
  }
  if (profit < 50 && grossMarginPct >= BUYER_MIN_GROSS_MARGIN_PCT) {
    warnings.push({
      code: "low-profit",
      severity: "warning",
      message: `Lav fortjeneste i kroner (${Math.round(profit)} kr per salg).`,
    });
  }

  // Lead buyer policy (decision levels)
  const score = calculateProductScore({
    costNOK: input.costNOK,
    suggestedPrice: input.suggestedPrice,
    category: input.category ?? "",
    subcategory: input.subcategory,
    name: input.name,
    originalTitle: input.originalTitle,
    description: input.description,
    imagesCount: input.images.length,
    variantsCount: input.variants.length,
    specsCount: Object.keys(input.specs).length,
    descriptionLength: input.description.replace(/<[^>]+>/g, "").length,
  });

  const buyerFit = evaluateBuyerFit({
    name: input.name,
    originalTitle: input.originalTitle,
    description: input.description,
    category: input.category ?? "",
    subcategory: input.subcategory,
    costNOK: input.costNOK,
    suggestedPrice: input.suggestedPrice,
    overallScore: score.overall,
    imagesCount: input.images.length,
    variantsCount: input.variants.length,
    specsCount: Object.keys(input.specs).length,
  });

  for (const issue of buyerFit.issues) {
    if (
      issue.code === "weak-margin" ||
      issue.code === "score-rejected" ||
      issue.code === "score-review" ||
      issue.code === "oversaturated-variants" ||
      issue.code === "weak-images" ||
      issue.code === "weak-specs"
    ) {
      continue;
    }
    warnings.push({
      code: issue.code,
      severity:
        issue.severity === "reject"
          ? "critical"
          : issue.severity === "review"
            ? "warning"
            : "info",
      message: issue.message,
    });
  }

  if (score.overall < BUYER_REVIEW_MIN_SCORE) {
    warnings.push({
      code: "score-rejected",
      severity: "critical",
      message: `Produktscore ${score.overall.toFixed(1)}/10 – REJECTED (under ${BUYER_REVIEW_MIN_SCORE}).`,
    });
  } else if (score.overall < BUYER_APPROVED_SCORE) {
    warnings.push({
      code: "score-review",
      severity: "warning",
      message: `Produktscore ${score.overall.toFixed(1)}/10 – REVIEW (${BUYER_REVIEW_MIN_SCORE}–${BUYER_APPROVED_SCORE}). Eier kan bestemme.`,
    });
  }

  const absolute = detectAbsoluteReject(
    `${input.name} ${input.originalTitle} ${input.description}`
  );
  if (absolute && !warnings.some((w) => w.code === "absolute-reject")) {
    warnings.push({
      code: "absolute-reject",
      severity: "critical",
      message: `Avvist: ${absolute}. Absolute butikkregler tillater ikke denne produkttypen.`,
    });
  }

  // Variants
  if (input.variants.length > 10) {
    warnings.push({
      code: "many-variants",
      severity: "warning",
      message: `Mange varianter (${input.variants.length}). Vurder å redusere for enklere vedlikehold.`,
    });
  }

  // Images
  if (input.images.length === 0) {
    warnings.push({
      code: "no-images",
      severity: "critical",
      message: "Ingen produktbilder funnet. Produktet kan ikke publiseres uten bilder.",
    });
  } else if (input.images.length < 3) {
    warnings.push({
      code: "few-images",
      severity: "warning",
      message: `Kun ${input.images.length} bilde(r). Flere bilder gir bedre konvertering.`,
    });
  }

  const thumbnailImages = input.images.filter(looksLikeThumbnail);
  if (thumbnailImages.length > 0 && thumbnailImages.length === input.images.length) {
    warnings.push({
      code: "low-quality-images",
      severity: "warning",
      message: "Bildene ser ut som lavoppløselige miniatyrbilder. Sjekk kvaliteten før publisering.",
    });
  }

  // Description
  const plainDescription = input.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (plainDescription.length < 100) {
    warnings.push({
      code: "short-description",
      severity: "warning",
      message: "Kort beskrivelse. Utfyllende beskrivelser gir bedre SEO og konvertering.",
    });
  }
  const combinedText = `${input.name} ${plainDescription} ${input.originalTitle}`.toLowerCase();
  const suspicious = SUSPICIOUS_PHRASES.filter((phrase) => combinedText.includes(phrase));
  if (suspicious.length > 0) {
    warnings.push({
      code: "suspicious-description",
      severity: "warning",
      message: `Beskrivelsen inneholder mistenkelige fraser (${suspicious.join(", ")}). Kontroller innholdet.`,
    });
  }

  // Specs
  if (Object.keys(input.specs).length === 0) {
    warnings.push({
      code: "missing-specs",
      severity: "warning",
      message: "Ingen tekniske spesifikasjoner. Legg til materiale, mål, kompatibilitet osv.",
    });
  }

  // Trademarks
  const trademarks = TRADEMARK_TERMS.filter((term) => combinedText.includes(term));
  if (trademarks.length > 0) {
    warnings.push({
      code: "trademark-risk",
      severity: "critical",
      message: `Mulig varemerkeproblem: "${trademarks.join('", "')}". Selg ikke uoffisielle merkevarer.`,
    });
  }

  // Price sanity (legacy scraper fallback: 9.99 USD ≈ 105 kr)
  if (isTemuFallbackSupplierCost(input.costNOK)) {
    warnings.push({
      code: "fallback-price",
      severity: "warning",
      message: "Leverandørprisen kunne ikke hentes og er satt til standardverdi. Verifiser kostpris manuelt.",
    });
  }

  return warnings;
}
