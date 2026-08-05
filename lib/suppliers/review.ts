/**
 * Intelligent review — auto-approve high-quality imports.
 */

import "server-only";

import { ImportQueueStatus } from "@prisma/client";
import type { ImportCompleteness } from "@/lib/suppliers/completeness";

export type ReviewDecision = {
  autoApprove: boolean;
  reason: string;
  requiresManual: boolean;
};

export function decideImportReview(opts: {
  completeness: ImportCompleteness | null | undefined;
  validationIssues?: Array<{ severity: string; message: string }>;
  imageDropped?: number;
  enrichmentWarning?: string | null;
  conflicts?: string[];
}): ReviewDecision {
  const score = opts.completeness?.score ?? 0;
  const parts = opts.completeness?.parts || [];
  const failedParts = parts.filter((p) => !p.ok).map((p) => p.label);
  const errors = (opts.validationIssues || []).filter((i) => i.severity === "error");
  const conflicts = opts.conflicts || [];
  const warnings: string[] = [];

  if (opts.enrichmentWarning) warnings.push(opts.enrichmentWarning);
  if ((opts.imageDropped || 0) > 0) {
    // Dedupe-only drops are OK; treat as soft warning unless unique loss flagged in completeness
    if (failedParts.includes("Images")) {
      warnings.push(`${opts.imageDropped} images filtered with mismatch`);
    }
  }
  if (failedParts.length) warnings.push(`Failed parts: ${failedParts.join(", ")}`);
  if (conflicts.length) warnings.push(`Conflicts: ${conflicts.join("; ")}`);

  const clean =
    score >= 99 &&
    errors.length === 0 &&
    conflicts.length === 0 &&
    !failedParts.includes("Images") &&
    !failedParts.includes("Variants") &&
    !failedParts.includes("Videos") &&
    !(opts.completeness?.requiresReview && score < 99);

  if (clean) {
    return {
      autoApprove: true,
      requiresManual: false,
      reason: `Auto-godkjent: completeness ${score}% uten advarsler/konflikter`,
    };
  }

  return {
    autoApprove: false,
    requiresManual: true,
    reason:
      warnings[0] ||
      errors[0]?.message ||
      `Manuell review: completeness ${score}%`,
  };
}

export function reviewStatusFromDecision(decision: ReviewDecision): ImportQueueStatus {
  return decision.autoApprove ? ImportQueueStatus.approved : ImportQueueStatus.review;
}
