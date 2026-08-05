/**
 * Human-readable failure reasons from ImportQueueItem.error / reviewReason.
 * Never invent counts — only group real messages.
 */

export type FailureReasonGroup = {
  key: string;
  label: string;
  count: number;
  samples: string[];
};

function classifyError(raw: string | null | undefined): { key: string; label: string } {
  const msg = (raw || "").trim();
  if (!msg) {
    return { key: "unknown", label: "Ukjent feil" };
  }
  const lower = msg.toLowerCase();

  if (
    lower.includes("unique constraint") ||
    lower.includes("unique constraint failed") ||
    lower.includes("p2002") ||
    lower.includes("already exists") ||
    lower.includes("finnes allerede") ||
    (lower.includes("unique") && lower.includes("supplierproductid")) ||
    (lower.includes("unique") && lower.includes("slug"))
  ) {
    return { key: "duplicate", label: "Produktet finnes allerede" };
  }

  if (
    lower.includes("timeout") ||
    lower.includes("etimedout") ||
    lower.includes("timed out") ||
    lower.includes("abort")
  ) {
    return { key: "timeout", label: "API timeout" };
  }

  if (
    lower.includes("mangler bilde") ||
    lower.includes("missing image") ||
    lower.includes("ingen bilde") ||
    (lower.includes("image") && lower.includes("required"))
  ) {
    return { key: "images", label: "Mangler bilder" };
  }

  if (
    lower.includes("pris mangler") ||
    lower.includes("mangler pris") ||
    (lower.includes("price") && (lower.includes("mangler") || lower.includes(" is 0")))
  ) {
    return { key: "price", label: "Ugyldig / manglende pris" };
  }

  if (
    lower.includes("valider") ||
    lower.includes("validation") ||
    lower.includes("quality gate") ||
    lower.includes("ai-") ||
    lower.includes("ai ")
  ) {
    return { key: "ai_validation", label: "AI-validering" };
  }

  if (
    lower.includes("unknown argument") ||
    lower.includes("prisma.product.create") ||
    lower.includes("invalid `prisma")
  ) {
    return { key: "db_write", label: "Database-lagring feilet" };
  }

  if (
    lower.includes("ikke funnet hos") ||
    lower.includes("not found") ||
    lower.includes("404")
  ) {
    return { key: "not_found", label: "Produkt ikke funnet hos leverandør" };
  }

  if (
    lower.includes("api") ||
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("503") ||
    lower.includes("502")
  ) {
    return { key: "api", label: "Leverandør-API feilet" };
  }

  // Keep a short readable label from the raw message
  const short = msg.replace(/\s+/g, " ").slice(0, 80);
  return { key: `raw:${short.slice(0, 40)}`, label: short };
}

export function summarizeFailureReasons(
  errors: Array<string | null | undefined>
): FailureReasonGroup[] {
  const map = new Map<string, FailureReasonGroup>();
  for (const raw of errors) {
    const { key, label } = classifyError(raw);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.samples.length < 3 && raw) {
        existing.samples.push(String(raw).slice(0, 160));
      }
    } else {
      map.set(key, {
        key,
        label,
        count: 1,
        samples: raw ? [String(raw).slice(0, 160)] : [],
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** Journey stages shown in the import progress dialog. */
export const IMPORT_JOURNEY_STAGES = [
  "waiting",
  "queuing",
  "importing",
  "ai_analyzing",
  "categorizing",
  "preparing_review",
  "done",
] as const;

export type ImportJourneyStage = (typeof IMPORT_JOURNEY_STAGES)[number];

export const IMPORT_JOURNEY_LABELS: Record<ImportJourneyStage, string> = {
  waiting: "Venter",
  queuing: "Sender til import",
  importing: "Importerer",
  ai_analyzing: "AI analyserer",
  categorizing: "Kategoriserer",
  preparing_review: "Klargjør review",
  done: "Ferdig",
};

/**
 * Map queue status distribution → current journey stage.
 * Prefers the «earliest» active stage so admin sees where work still is.
 */
export function resolveJourneyStage(input: {
  phase: "waiting" | "queuing" | "processing" | "done" | "error";
  queued: number;
  importing: number;
  aiAnalyzing: number;
  review: number;
  approved: number;
  published: number;
  failed: number;
  complete: boolean;
}): ImportJourneyStage {
  if (input.phase === "waiting") return "waiting";
  if (input.phase === "queuing") return "queuing";
  if (input.complete || input.phase === "done" || input.phase === "error") {
    return "done";
  }
  if (input.queued > 0 && input.importing === 0 && input.aiAnalyzing === 0) {
    return "importing";
  }
  if (input.importing > 0) return "importing";
  if (input.aiAnalyzing > 0) return "ai_analyzing";
  // Items in review/approved means categorization + prepare happened
  if (input.review + input.approved + input.published > 0 && !input.complete) {
    return "preparing_review";
  }
  return "categorizing";
}
