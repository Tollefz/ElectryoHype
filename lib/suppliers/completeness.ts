/**
 * Import completeness score — supplier data vs what we persisted.
 * Score < 95 → requires human review.
 */

export type CompletenessPart = {
  label: string;
  got: number;
  expected: number;
  ok: boolean;
  detail?: string;
};

export type ImportCompleteness = {
  parts: CompletenessPart[];
  score: number;
  requiresReview: boolean;
  summary: string;
};

function part(
  label: string,
  got: number,
  expected: number,
  detail?: string
): CompletenessPart {
  // For countable supplier assets: never lose data (got >= expected).
  // Extra AI keys on specs are fine.
  const ok = expected <= 0 ? true : got >= expected;
  return {
    label,
    got,
    expected,
    ok,
    detail,
  };
}

export type CompletenessInput = {
  sourceImages: number;
  savedImages: number;
  sourceVariants: number;
  savedVariants: number;
  sourceSpecs: number;
  savedSpecs: number;
  sourceAttributes: number;
  savedAttributes: number;
  sourceVideos: number;
  savedVideos: number;
  inventoryOk: boolean;
  inventoryDetail?: string;
  pricingOk: boolean;
  skuOk: boolean;
  aiOk: boolean;
  seoOk: boolean;
};

export function calculateImportCompleteness(input: CompletenessInput): ImportCompleteness {
  const parts: CompletenessPart[] = [
    part(
      "Images",
      input.savedImages,
      input.sourceImages,
      input.savedImages === input.sourceImages ? undefined : "image count mismatch"
    ),
    part("Variants", input.savedVariants, input.sourceVariants),
    part("Specifications", input.savedSpecs, input.sourceSpecs),
    part("Attributes", input.savedAttributes, input.sourceAttributes),
    part("Videos", input.savedVideos, input.sourceVideos),
    {
      label: "Inventory",
      got: input.inventoryOk ? 1 : 0,
      expected: 1,
      ok: input.inventoryOk,
      detail: input.inventoryDetail,
    },
    {
      label: "Pricing",
      got: input.pricingOk ? 1 : 0,
      expected: 1,
      ok: input.pricingOk,
    },
    {
      label: "SKU",
      got: input.skuOk ? 1 : 0,
      expected: 1,
      ok: input.skuOk,
    },
    {
      label: "AI",
      got: input.aiOk ? 1 : 0,
      expected: 1,
      ok: input.aiOk,
    },
    {
      label: "SEO",
      got: input.seoOk ? 1 : 0,
      expected: 1,
      ok: input.seoOk,
    },
  ];

  // Exact match required for images/variants/videos (no silent loss)
  for (const p of parts) {
    if (["Images", "Variants", "Videos"].includes(p.label) && p.expected > 0) {
      p.ok = p.got === p.expected;
    }
  }

  const weights: Record<string, number> = {
    Images: 20,
    Variants: 20,
    Specifications: 20,
    Attributes: 10,
    Videos: 5,
    Inventory: 10,
    Pricing: 5,
    SKU: 5,
    AI: 3,
    SEO: 2,
  };

  let earned = 0;
  let total = 0;
  for (const p of parts) {
    const w = weights[p.label] ?? 5;
    total += w;
    if (p.expected === 0 && ["Videos", "Attributes", "Specifications"].includes(p.label)) {
      earned += w;
    } else if (p.ok) {
      earned += w;
    } else if (p.expected > 0 && p.got > 0) {
      earned += w * Math.min(1, p.got / p.expected);
    }
  }

  const score = Math.min(100, Math.round((earned / total) * 1000) / 10);
  const requiresReview = score < 95;

  const summary = parts
    .map((p) =>
      p.expected === 0 && ["Videos", "Attributes", "Specifications"].includes(p.label)
        ? `${p.label}: n/a`
        : `${p.label}: ${p.got}/${p.expected}${p.ok ? "" : " ✗"}`
    )
    .join(" · ");

  return { parts, score, requiresReview, summary };
}
