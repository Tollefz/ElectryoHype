/**
 * Pre-import quality validation for ElectroHypeX.
 *
 * Data completeness + Lead Product Buyer decision levels:
 *   APPROVED / REVIEW → owner may import
 *   REJECTED → hard block
 *
 * Pure module – safe on server and client.
 */

import {
  BUYER_APPROVED_SCORE,
  BUYER_REVIEW_MIN_SCORE,
  evaluateBuyerFit,
  type BuyerDecision,
  type BuyerFitIssue,
} from "@/lib/import/buyer-policy";
import { calculateProductScore } from "@/lib/import/product-score";

export interface QualityCheckItem {
  key: string;
  label: string;
  ok: boolean;
  /** Soft misses can still be overridden; hard blocks cannot. */
  blocking?: boolean;
  detail?: string;
}

export interface QualityCheckResult {
  passed: boolean;
  /** True when decision is APPROVED. */
  buyerApproved: boolean;
  /** True when owner may import (APPROVED or REVIEW). */
  canImport: boolean;
  buyerDecision: BuyerDecision;
  failedCount: number;
  blockingFailures: number;
  checks: QualityCheckItem[];
  buyerIssues: BuyerFitIssue[];
  overallScore: number;
}

export interface QualityCheckInput {
  name: string;
  description: string;
  originalTitle?: string;
  images: string[];
  suggestedPrice: number;
  costNOK?: number;
  category: string;
  subcategory?: string | null;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  tags: string[];
  specs: Record<string, string>;
  variantsCount?: number;
}

export function runQualityCheck(input: QualityCheckInput): QualityCheckResult {
  const descriptionLength = input.description.replace(/<[^>]+>/g, "").trim().length;
  const costNOK = input.costNOK ?? 0;

  const score = calculateProductScore({
    costNOK,
    suggestedPrice: input.suggestedPrice,
    category: input.category,
    subcategory: input.subcategory,
    name: input.name,
    originalTitle: input.originalTitle,
    description: input.description,
    imagesCount: input.images.length,
    variantsCount: input.variantsCount ?? 0,
    specsCount: Object.keys(input.specs).length,
    descriptionLength,
  });

  const buyerFit = evaluateBuyerFit({
    name: input.name,
    originalTitle: input.originalTitle,
    description: input.description,
    category: input.category,
    subcategory: input.subcategory,
    costNOK,
    suggestedPrice: input.suggestedPrice,
    overallScore: score.overall,
    imagesCount: input.images.length,
    variantsCount: input.variantsCount ?? 0,
    specsCount: Object.keys(input.specs).length,
  });

  const decisionDetail =
    buyerFit.decision === "approved"
      ? `APPROVED (${score.overall.toFixed(1)}/10)`
      : buyerFit.decision === "review"
        ? `REVIEW (${score.overall.toFixed(1)}/10) – eier kan bestemme`
        : `REJECTED (${score.overall.toFixed(1)}/10)`;

  const checks: QualityCheckItem[] = [
    {
      key: "title",
      label: "Tittel",
      ok: input.name.trim().length >= 10 && input.name.trim().length <= 60,
      detail:
        input.name.trim().length === 0
          ? "Tittel mangler"
          : input.name.trim().length < 10
            ? "Tittelen er for kort (min 10 tegn)"
            : input.name.trim().length > 60
              ? `Tittelen er for lang (${input.name.trim().length}/60 tegn)`
              : `${input.name.trim().length}/60 tegn`,
    },
    {
      key: "images",
      label: "Bilder",
      ok: input.images.length > 0,
      blocking: true,
      detail: input.images.length > 0 ? `${input.images.length} bilde(r)` : "Ingen bilder",
    },
    {
      key: "price",
      label: "Pris",
      ok: input.suggestedPrice > 0,
      blocking: true,
      detail: input.suggestedPrice > 0 ? `${Math.round(input.suggestedPrice)} kr` : "Pris mangler",
    },
    {
      key: "category",
      label: "Kategori",
      ok: input.category.trim().length > 0,
      blocking: true,
      detail: input.category || "Kategori mangler",
    },
    {
      key: "slug",
      label: "Slug",
      ok: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug),
      detail: input.slug
        ? /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)
          ? input.slug
          : "Ugyldig slug-format"
        : "Slug mangler",
    },
    {
      key: "description",
      label: "Beskrivelse",
      ok: descriptionLength >= 50,
      detail: descriptionLength >= 50 ? "OK" : "Beskrivelsen er for kort (min 50 tegn)",
    },
    {
      key: "seo",
      label: "SEO (meta-tittel/-beskrivelse)",
      ok:
        input.metaTitle.trim().length >= 10 &&
        input.metaTitle.trim().length <= 60 &&
        input.metaDescription.trim().length >= 30 &&
        input.metaDescription.trim().length <= 155,
      detail:
        input.metaTitle.trim().length < 10
          ? "Meta-tittel mangler eller er for kort"
          : input.metaTitle.trim().length > 60
            ? "Meta-tittel er for lang"
            : input.metaDescription.trim().length < 30
              ? "Meta-beskrivelse mangler eller er for kort"
              : input.metaDescription.trim().length > 155
                ? "Meta-beskrivelse er for lang"
                : "OK",
    },
    {
      key: "keywords",
      label: "Søkeord",
      ok: input.tags.length >= 3,
      detail: input.tags.length >= 3 ? `${input.tags.length} søkeord` : "Minst 3 søkeord anbefales",
    },
    {
      key: "specs",
      label: "Spesifikasjoner",
      ok: Object.keys(input.specs).length > 0,
      detail:
        Object.keys(input.specs).length > 0
          ? `${Object.keys(input.specs).length} spesifikasjon(er)`
          : "Ingen spesifikasjoner",
    },
    {
      key: "buyer-decision",
      label: "Kjøpsbeslutning",
      ok: buyerFit.canImport,
      blocking: true,
      detail: decisionDetail,
    },
    {
      key: "buyer-score-band",
      label: `Score-bånd (≥ ${BUYER_REVIEW_MIN_SCORE} / godkjent ≥ ${BUYER_APPROVED_SCORE})`,
      ok: score.overall >= BUYER_REVIEW_MIN_SCORE,
      blocking: score.overall < BUYER_REVIEW_MIN_SCORE,
      detail: `${score.overall.toFixed(1)}/10`,
    },
  ];

  const failedCount = checks.filter((check) => !check.ok).length;
  const blockingFailures = checks.filter((check) => !check.ok && check.blocking).length;

  return {
    passed: failedCount === 0,
    buyerApproved: buyerFit.approved,
    canImport: buyerFit.canImport && input.images.length > 0 && input.suggestedPrice > 0,
    buyerDecision: buyerFit.decision,
    failedCount,
    blockingFailures,
    checks,
    buyerIssues: buyerFit.issues,
    overallScore: score.overall,
  };
}
