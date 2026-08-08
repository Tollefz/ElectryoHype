/**
 * Map import / Prisma / pipeline errors → Norwegian admin-facing copy.
 * Never show stack traces or Prisma dumps in the UI.
 */

export type ImportErrorView = {
  key: string;
  /** Short understandable title */
  title: string;
  /** Why it failed */
  reason: string;
  /** What admin should do next */
  action: string;
  /** Optional product hint (title / supplier id) */
  productHint?: string;
};

function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message || "Ukjent feil";
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error ?? "Ukjent feil");
  }
}

function extractConstraintField(msg: string): string | null {
  const m =
    msg.match(/Unique constraint failed on the fields?:?\s*\(`?([^)`]+)`?\)/i) ||
    msg.match(/fields?:\s*\(`?([^)`]+)`?\)/i);
  return m?.[1]?.replace(/[`\s]/g, "") ?? null;
}

/**
 * Convert any raw import failure into a safe, structured admin message.
 */
export function mapImportError(
  error: unknown,
  ctx?: { title?: string | null; supplierProductId?: string | null }
): ImportErrorView {
  const raw = rawMessage(error);
  const lower = raw.toLowerCase();
  const productHint =
    [ctx?.title?.trim(), ctx?.supplierProductId?.trim()]
      .filter(Boolean)
      .join(" · ") || undefined;

  const withProduct = (view: ImportErrorView): ImportErrorView =>
    productHint ? { ...view, productHint } : view;

  if (
    lower.includes("p2002") ||
    lower.includes("unique constraint") ||
    (lower.includes("unique") &&
      (lower.includes("slug") ||
        lower.includes("sku") ||
        lower.includes("supplierproductid")))
  ) {
    const field = extractConstraintField(raw)?.toLowerCase() ?? "";
    if (field.includes("slug")) {
      return withProduct({
        key: "duplicate_slug",
        title: "Produktet finnes allerede",
        reason: "Et produkt med samme nettadresse (slug) ligger allerede i katalogen.",
        action: "Åpne eksisterende produkt, eller hopp over importen.",
      });
    }
    if (field.includes("sku")) {
      return withProduct({
        key: "duplicate_sku",
        title: "Produktet finnes allerede",
        reason: "SKU er allerede i bruk i katalogen.",
        action: "Sjekk eksisterende produkt, eller hopp over.",
      });
    }
    if (field.includes("supplierproductid") || field.includes("supplier")) {
      return withProduct({
        key: "duplicate_supplier",
        title: "Produktet finnes allerede",
        reason: "Samme leverandørprodukt er allerede importert.",
        action: "Åpne eksisterende produkt i katalogen.",
      });
    }
    return withProduct({
      key: "duplicate",
      title: "Produktet finnes allerede",
      reason: "Duplikat i databasen (unik verdi kolliderte).",
      action: "Sjekk katalogen for eksisterende produkt, eller hopp over.",
    });
  }

  if (
    lower.includes("unknown argument") ||
    lower.includes("invalid `prisma") ||
    lower.includes("prisma.product.create") ||
    (lower.includes("argument `") && lower.includes("is missing"))
  ) {
    return withProduct({
      key: "db_write",
      title: "Kunne ikke lagre produktet",
      reason: "Databasefeltet stemmer ikke med det importen forsøkte å skrive.",
      action: "Prøv «Behandle» på nytt. Hvis det gjentar seg, sjekk worker-loggen.",
    });
  }

  if (
    lower.includes("p2003") ||
    lower.includes("foreign key") ||
    lower.includes("violates foreign key")
  ) {
    return withProduct({
      key: "fk",
      title: "Kunne ikke knytte produktet",
      reason: "En påkrevd kobling (f.eks. leverandørkonto) mangler eller er ugyldig.",
      action: "Sjekk leverandørkonto og prøv på nytt.",
    });
  }

  if (
    lower.includes("p2025") ||
    lower.includes("record to update not found") ||
    lower.includes("no record was found")
  ) {
    return withProduct({
      key: "not_found_db",
      title: "Fant ikke posten",
      reason: "Produktet eller køelementet ble slettet eller endret underveis.",
      action: "Oppdater listen og prøv på nytt om nødvendig.",
    });
  }

  if (
    lower.includes("timeout") ||
    lower.includes("etimedout") ||
    lower.includes("timed out") ||
    lower.includes("aborted")
  ) {
    return withProduct({
      key: "timeout",
      title: "Leverandør svarte ikke i tide",
      reason: "API-kallet tok for lang tid eller ble avbrutt.",
      action: "Klikk «Behandle» for å prøve på nytt.",
    });
  }

  if (
    lower.includes("mangler bilde") ||
    lower.includes("missing image") ||
    lower.includes("ingen bilde") ||
    (lower.includes("image") && lower.includes("required"))
  ) {
    return withProduct({
      key: "images",
      title: "Mangler bilder",
      reason: "Importen krever minst ett produktbilde.",
      action: "Hent bilder fra leverandør, eller hopp over produktet.",
    });
  }

  if (
    lower.includes("pris mangler") ||
    lower.includes("mangler pris") ||
    (lower.includes("price") && (lower.includes("mangler") || lower.includes(" is 0")))
  ) {
    return withProduct({
      key: "price",
      title: "Ugyldig eller manglende pris",
      reason: "Kostnad eller salgspris mangler eller er null.",
      action: "Oppdater pris fra leverandør og prøv på nytt.",
    });
  }

  if (
    lower.includes("quality gate") ||
    lower.includes("rejected") ||
    lower.includes("store dna") ||
    lower.includes("passer ikke")
  ) {
    return withProduct({
      key: "policy",
      title: "Stoppet av sortimentsregler",
      reason: "Produktet bryter Store DNA / kjøperpolicy og kan ikke publiseres.",
      action: "Ikke importer — velg et produkt innen elektronikksortimentet.",
    });
  }

  if (
    lower.includes("ikke funnet hos") ||
    lower.includes("not found") ||
    lower.includes("404")
  ) {
    return withProduct({
      key: "not_found",
      title: "Produkt ikke funnet hos leverandør",
      reason: "Leverandøren returnerte tomt eller 404 for dette produktet.",
      action: "Sjekk produkt-ID hos leverandør, eller fjern fra køen.",
    });
  }

  if (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("econnreset") ||
    lower.includes("fetch failed")
  ) {
    return withProduct({
      key: "api",
      title: "Leverandør-API feilet",
      reason: "Midlertidig feil eller begrensning mot leverandøren.",
      action: "Vent litt og klikk «Behandle» på nytt.",
    });
  }

  if (
    lower.includes("p1001") ||
    lower.includes("p1002") ||
    lower.includes("p1017") ||
    lower.includes("can't reach database") ||
    lower.includes("connection")
  ) {
    return withProduct({
      key: "db_conn",
      title: "Database utilgjengelig",
      reason: "Kunne ikke nå databasen under import.",
      action: "Prøv igjen om litt. Hvis det vedvarer, sjekk DATABASE_URL / Neon-kvote.",
    });
  }

  // Already-mapped Norwegian short messages from older sanitize — keep readable
  if (
    raw.startsWith("Produktet finnes allerede") ||
    raw.startsWith("Database-lagring feilet") ||
    raw.startsWith("API timeout") ||
    raw.startsWith("Kunne ikke")
  ) {
    return withProduct({
      key: "mapped",
      title: raw.split(/[.(]/)[0]!.slice(0, 80),
      reason: raw.slice(0, 160),
      action: "Se detalj over, eller prøv «Behandle» på nytt.",
    });
  }

  return withProduct({
    key: "unknown",
    title: "Import feilet",
    reason: "En uventet feil stoppet importen av dette produktet.",
    action: "Prøv «Behandle» på nytt. Hvis det gjentar seg, sjekk worker-loggen.",
  });
}

/** Compact one-line string for DB storage (ImportQueueItem.error). */
export function formatImportErrorForStorage(
  error: unknown,
  ctx?: { title?: string | null; supplierProductId?: string | null }
): string {
  const v = mapImportError(error, ctx);
  const parts = [v.title, v.reason, v.action];
  if (v.productHint) parts.unshift(`Produkt: ${v.productHint}`);
  return parts.join(" — ").slice(0, 480);
}

/** UI helper: structured view from stored string or raw error. */
export function presentImportError(
  storedOrRaw: string | null | undefined,
  ctx?: { title?: string | null; supplierProductId?: string | null }
): ImportErrorView {
  if (!storedOrRaw?.trim()) {
    return mapImportError("unknown", ctx);
  }
  // Prefer re-mapping so historical Prisma dumps become human
  return mapImportError(storedOrRaw, ctx);
}

export type FailureReasonGroup = {
  key: string;
  label: string;
  count: number;
  samples: string[];
};

export function summarizeFailureReasons(
  errors: Array<string | null | undefined>
): FailureReasonGroup[] {
  const map = new Map<string, FailureReasonGroup>();
  for (const raw of errors) {
    const view = presentImportError(raw);
    const existing = map.get(view.key);
    if (existing) {
      existing.count += 1;
      if (existing.samples.length < 3 && raw) {
        existing.samples.push(view.title);
      }
    } else {
      map.set(view.key, {
        key: view.key,
        label: view.title,
        count: 1,
        samples: [view.title],
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
  if (input.review + input.approved + input.published > 0 && !input.complete) {
    return "preparing_review";
  }
  return "categorizing";
}
