/**
 * Deterministic auto-publish quality gate for buyer approvals.
 * Fail closed on real problems — never guess.
 */

import { detectAbsoluteReject } from "@/lib/import/buyer-policy";
import { classifyBuyerCandidate } from "@/lib/buyer/classify-candidate";
import { MARGIN_HARD_STOP_PCT } from "@/lib/buyer/margin-policy";
import { IDENTITY_FIT_REJECT } from "@/lib/identity";

/** Hard floor for automatic publish (admin may still publish via Avansert). */
export const AUTO_PUBLISH_MIN_MARGIN_PCT = MARGIN_HARD_STOP_PCT;
export const AUTO_PUBLISH_MIN_CATEGORY_CONFIDENCE = 50;
export const AUTO_PUBLISH_MIN_IMAGES = 1;
/** Store Identity Fit — below this normally blocks publish (good margin is not enough) */
export const AUTO_PUBLISH_MIN_IDENTITY_FIT = IDENTITY_FIT_REJECT;

export type AutoPublishGateInput = {
  title: string;
  canImport?: boolean;
  merchandiserRecId?: string | null;
  imageUrl?: string | null;
  images?: string[] | null;
  costNOK?: number | null;
  retailNOK?: number | null;
  marginPct?: number | null;
  variantCount?: number | null;
  deliveryHint?: string | null;
  /** After pipeline process */
  queueStatus?: string | null;
  reviewReason?: string | null;
  completenessScore?: number | null;
  completenessRequiresReview?: boolean | null;
  productId?: string | null;
  aiCategoryConfidence?: number | null;
  /** Economic Validation confidence (0–100) */
  economicConfidence?: number | null;
  /** Fail closed if economic layer did not pass */
  requireEconomicPass?: boolean;
  /**
   * Admin already said JA — don't block solely on pipeline "review" status.
   * Still block on concrete safety problems.
   */
  adminApproved?: boolean;
  /** Store Identity Fit 0–100 — required assessment before publish */
  identityFitScore?: number | null;
  identityFitWhy?: string | null;
  /**
   * Rare exception: admin override when identity is reject-band.
   * Must include a non-empty rationale to bypass.
   */
  identityExceptionReason?: string | null;
};

export type AutoPublishGateResult = {
  ok: boolean;
  problems: string[];
  reasonsOk: string[];
};

export function evaluateAutoPublishGate(
  input: AutoPublishGateInput
): AutoPublishGateResult {
  const problems: string[] = [];
  const reasonsOk: string[] = [];
  const title = (input.title || "").trim();

  if (!title) {
    problems.push("Mangler produkttittel");
  }

  const banned = detectAbsoluteReject(title);
  if (banned) {
    problems.push(`Problemprodukt / regelbrudd: ${banned}`);
  }

  const tax = classifyBuyerCandidate(title);
  if (!tax.fitsElectroHype) {
    problems.push(
      tax.rejectReason || "Passer ikke ElectroHype-sortimentet"
    );
  } else if (tax.confidence < AUTO_PUBLISH_MIN_CATEGORY_CONFIDENCE) {
    problems.push(
      `Svært lav kategorikonfidens (${tax.confidence}% < ${AUTO_PUBLISH_MIN_CATEGORY_CONFIDENCE}%)`
    );
  } else {
    reasonsOk.push(
      `Kategori ${tax.main}${tax.subcategory ? ` › ${tax.subcategory}` : ""} (${tax.confidence}%)`
    );
  }

  if (
    input.identityFitScore != null &&
    Number.isFinite(input.identityFitScore)
  ) {
    if (input.identityFitScore < AUTO_PUBLISH_MIN_IDENTITY_FIT) {
      const exception = String(input.identityExceptionReason || "").trim();
      if (exception.length >= 12) {
        reasonsOk.push(
          `Identitetsunntak (score ${Math.round(input.identityFitScore)}): ${exception.slice(0, 120)}`
        );
      } else {
        problems.push(
          input.identityFitWhy ||
            `Store Identity Fit for lav (${Math.round(input.identityFitScore)} < ${AUTO_PUBLISH_MIN_IDENTITY_FIT}) — kunder forventer ikke dette i butikken. God margin/levering overstyrer ikke uten begrunnet unntak.`
        );
      }
    } else {
      reasonsOk.push(
        `Store Identity Fit ${Math.round(input.identityFitScore)}/100`
      );
    }
  }

  if (input.aiCategoryConfidence != null && input.aiCategoryConfidence < AUTO_PUBLISH_MIN_CATEGORY_CONFIDENCE) {
    problems.push(
      `AI-kategori usikker (${Math.round(input.aiCategoryConfidence)}%)`
    );
  }

  if (input.canImport === false) {
    problems.push("Mangler importkobling til leverandørdata");
  } else if (
    input.merchandiserRecId !== undefined &&
    (input.merchandiserRecId == null || input.merchandiserRecId === "")
  ) {
    problems.push("Mangler importkobling til leverandørdata");
  }

  const imageCount =
    (Array.isArray(input.images) ? input.images.filter(Boolean).length : 0) ||
    (input.imageUrl ? 1 : 0);
  if (imageCount < AUTO_PUBLISH_MIN_IMAGES) {
    problems.push("Ingen brukbare produktbilder");
  } else {
    reasonsOk.push(`${imageCount} bilde(r)`);
  }

  const retail = input.retailNOK;
  const cost = input.costNOK;
  if (retail == null || !Number.isFinite(retail) || retail <= 0) {
    problems.push("Manglende eller ugyldig salgspris");
  } else {
    reasonsOk.push(`Salgspris ${Math.round(retail)} kr`);
  }
  if (cost == null || !Number.isFinite(cost) || cost <= 0) {
    problems.push("Manglende eller ugyldig innkjøpspris");
  }

  if (input.marginPct != null && Number.isFinite(input.marginPct)) {
    if (input.marginPct < AUTO_PUBLISH_MIN_MARGIN_PCT) {
      problems.push(
        `Margin under sikker minimumsgrense (${Math.round(input.marginPct)}% < ${AUTO_PUBLISH_MIN_MARGIN_PCT}%)`
      );
    } else if (input.marginPct > 80) {
      problems.push(
        `Ekstrem margin (${Math.round(input.marginPct)}%) — økonomisk kontroll feilet`
      );
    } else {
      reasonsOk.push(`Margin ${Math.round(input.marginPct)}%`);
    }
  } else if (retail != null && cost != null && retail > 0) {
    const m = ((retail - cost) / retail) * 100;
    if (m < AUTO_PUBLISH_MIN_MARGIN_PCT) {
      problems.push(
        `Margin under sikker minimumsgrense (${Math.round(m)}% < ${AUTO_PUBLISH_MIN_MARGIN_PCT}%)`
      );
    } else if (retail < cost) {
      problems.push("Salgspris lavere enn landed cost");
    }
  }

  if (
    input.economicConfidence != null &&
    Number.isFinite(input.economicConfidence) &&
    input.economicConfidence < 90
  ) {
    problems.push(
      `Økonomisk sikkerhet under 90% (${Math.round(input.economicConfidence)}%) — ny kontroll kreves`
    );
  } else if (
    input.economicConfidence != null &&
    Number.isFinite(input.economicConfidence)
  ) {
    reasonsOk.push(`Økonomisk sikkerhet ${Math.round(input.economicConfidence)}%`);
  }

  if (input.requireEconomicPass && input.economicConfidence == null) {
    problems.push("Mangler økonomisk validering før publisering");
  }

  if (retail != null && cost != null && retail > 0 && retail < cost) {
    problems.push("Salgspris lavere enn landed cost");
  }

  if (input.variantCount != null && input.variantCount > 40) {
    problems.push("Uklar / for kompleks variantstruktur");
  }

  // Post-pipeline signals
  if (input.queueStatus === "failed") {
    problems.push(input.reviewReason || "Import feilet");
  }

  if (input.adminApproved) {
    // Explicit JA: only block on concrete failures already collected,
    // plus missing draft product after pipeline.
    if (
      input.productId !== undefined &&
      (input.productId == null || input.productId === "") &&
      input.queueStatus &&
      input.queueStatus !== "queued"
    ) {
      problems.push("Ingen produktdraft ble opprettet");
    }
  } else {
    if (input.queueStatus === "review" || input.completenessRequiresReview) {
      problems.push(
        input.reviewReason ||
          `Import trenger manuell kontroll` +
            (input.completenessScore != null
              ? ` (completeness ${input.completenessScore}%)`
              : "")
      );
    }
  }

  if (
    input.queueStatus &&
    !["approved", "published", "review", "failed", "queued"].includes(
      input.queueStatus
    )
  ) {
    problems.push(`Uventet køstatus: ${input.queueStatus}`);
  }

  // Dedupe problems
  const unique = [...new Set(problems)];
  return {
    ok: unique.length === 0,
    problems: unique,
    reasonsOk,
  };
}
