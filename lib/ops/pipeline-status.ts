/**
 * Shared Import Queue status vocabulary — one definition for all admin surfaces.
 */

import type { ImportQueueStatus } from "@prisma/client";

/** UI buckets used on Importkø status cards and truth API. */
export const PIPELINE_BUCKETS = [
  "queued",
  "importing",
  "ai_analyzing",
  "review",
  "ready_publish",
  "published",
  "failed",
] as const;

export type PipelineBucket = (typeof PIPELINE_BUCKETS)[number];

export const PIPELINE_BUCKET_LABELS: Record<PipelineBucket, string> = {
  queued: "I kø",
  importing: "Importeres",
  ai_analyzing: "AI analyserer",
  review: "Klar for review",
  ready_publish: "Klar for publisering",
  published: "Publisert",
  failed: "Feilet",
};

/** Prisma statuses that map into each UI bucket. */
export const BUCKET_STATUSES: Record<PipelineBucket, ImportQueueStatus[]> = {
  queued: ["queued"],
  importing: ["processing"],
  ai_analyzing: [
    "validating",
    "normalizing",
    "enriching",
    "quality_check",
    "preview",
    "ai",
  ],
  review: ["review"],
  ready_publish: ["approved"],
  published: ["published"],
  failed: ["failed"],
};

/** Still in the import pipeline (not terminal for a batch progress view). */
export const IN_FLIGHT_STATUSES: ImportQueueStatus[] = [
  ...BUCKET_STATUSES.queued,
  ...BUCKET_STATUSES.importing,
  ...BUCKET_STATUSES.ai_analyzing,
];

export const DONE_OK_STATUSES: ImportQueueStatus[] = [
  ...BUCKET_STATUSES.review,
  ...BUCKET_STATUSES.ready_publish,
  ...BUCKET_STATUSES.published,
];

export function statusToBucket(
  status: string | null | undefined
): PipelineBucket | null {
  if (!status) return null;
  for (const bucket of PIPELINE_BUCKETS) {
    if ((BUCKET_STATUSES[bucket] as string[]).includes(status)) return bucket;
  }
  return null;
}

export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "Ikke nok data";
  return n.toLocaleString("no-NO");
}

export function formatMetric(
  value: number | string | null | undefined,
  suffix = ""
): string {
  if (value == null || value === "") return "Ikke nok data";
  if (typeof value === "number" && !Number.isFinite(value)) return "Ikke nok data";
  return `${value}${suffix}`;
}
