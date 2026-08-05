/**
 * Admin data-error vocabulary — never leak Prisma/stack to the UI.
 * Safe for client + server.
 */

export type AdminErrorKind =
  | "database"
  | "quota"
  | "network"
  | "timeout"
  | "supplier"
  | "auth"
  | "not_found"
  | "server"
  | "unknown";

export type AdminDataError = {
  kind: AdminErrorKind;
  /** Short human title */
  title: string;
  /** One-line reason for the user */
  reason: string;
  /** HTTP status when applicable */
  status?: number;
  /** Server-only raw message for logs — never render in UI */
  logMessage?: string;
};

const QUOTA_RE =
  /quota|exceeded the data transfer|transfer quota|storage quota|rate limit/i;
const DB_RE =
  /prisma|neon|postgres|database|p1001|p1002|p1017|can't reach|connection|econnrefused|enotfound|pool|connector|failed to run query|engine error/i;
const TIMEOUT_RE = /timeout|timed out|etimedout|abort|aborted/i;
const NETWORK_RE = /network|fetch failed|failed to fetch|offline|dns|socket/i;
const SUPPLIER_RE = /supplier|cj api|temu|aliexpress|leverandør/i;

export function classifyAdminError(input: unknown, status?: number): AdminDataError {
  const raw =
    input instanceof Error
      ? input.message
      : typeof input === "string"
        ? input
        : input && typeof input === "object" && "message" in input
          ? String((input as { message: unknown }).message)
          : String(input ?? "Ukjent feil");

  const logMessage = raw.slice(0, 500);

  if (status === 401 || status === 403) {
    return {
      kind: "auth",
      title: "Ingen tilgang",
      reason: "Økten er utløpt eller mangler rettigheter. Logg inn på nytt.",
      status,
      logMessage,
    };
  }
  if (status === 404) {
    return {
      kind: "not_found",
      title: "Fant ikke data",
      reason: "Ressursen finnes ikke eller er flyttet.",
      status,
      logMessage,
    };
  }

  if (QUOTA_RE.test(raw) || status === 402) {
    return {
      kind: "quota",
      title: "Database-kvote overskredet",
      reason: "Databasen har nådd kapasitetsgrensen. Prøv igjen senere eller sjekk hosting-status.",
      status,
      logMessage,
    };
  }
  if (TIMEOUT_RE.test(raw) || status === 408 || status === 504) {
    return {
      kind: "timeout",
      title: "Forespørselen tok for lang tid",
      reason: "Tjenesten svarte ikke i tide. Prøv igjen om litt.",
      status,
      logMessage,
    };
  }
  if (DB_RE.test(raw) || status === 503) {
    return {
      kind: "database",
      title: "Databasen er utilgjengelig",
      reason: "Databasen svarer ikke akkurat nå. Admin kan fortsatt navigeres — prøv igjen om litt.",
      status,
      logMessage,
    };
  }
  if (SUPPLIER_RE.test(raw) || status === 502) {
    return {
      kind: "supplier",
      title: "Leverandør utilgjengelig",
      reason: "Leverandør-API svarte ikke. Butikken din er upåvirket.",
      status,
      logMessage,
    };
  }
  if (NETWORK_RE.test(raw) || status === 0) {
    return {
      kind: "network",
      title: "Nettverksfeil",
      reason: "Ingen kontakt med serveren. Sjekk internettforbindelsen.",
      status,
      logMessage,
    };
  }
  if (status && status >= 500) {
    return {
      kind: "server",
      title: "Tjenesten svarte med feil",
      reason: "Noe gikk galt på serveren. Prøv igjen om litt.",
      status,
      logMessage,
    };
  }

  return {
    kind: "unknown",
    title: "Kan ikke hente data",
    reason: "Noe gikk galt under lasting. Prøv igjen.",
    status,
    logMessage,
  };
}

/** Context-specific titles for known surfaces. */
export const ADMIN_SURFACE_COPY = {
  products: {
    errorTitle: "Kunne ikke hente produkter",
    emptyTitle: "Ingen produkter ennå",
    emptyDetail: "Importer fra Produktkjøper eller leverandørkatalog for å komme i gang.",
  },
  orders: {
    errorTitle: "Ordresystem utilgjengelig",
    emptyTitle: "Ingen ordre ennå",
    emptyDetail: "Når kunder handler, dukker ordrene opp her.",
  },
  buyer: {
    errorTitle: "Kunne ikke hente AI-anbefalinger",
    emptyTitle: "Ingen kandidater ennå",
    emptyDetail: "Start et AI-oppdrag for å finne produkter til butikken.",
  },
  intelligence: {
    errorTitle: "Butikkinnsikt er midlertidig utilgjengelig",
    emptyTitle: "Ikke nok data til analyse",
    emptyDetail: "Når katalogen vokser, får du anbefalinger her.",
  },
  trust: {
    errorTitle: "AI Trust utilgjengelig",
    emptyTitle: "Ingen administratørhandlinger registrert",
    emptyDetail: "Når du godkjenner, avviser eller endrer AI-forslag, vises læringen her.",
  },
  suppliers: {
    errorTitle: "Leverandørstatus utilgjengelig",
    emptyTitle: "Ingen leverandørdata",
    emptyDetail: "Koble til en leverandør for å se status.",
  },
  importQueue: {
    errorTitle: "Kunne ikke hente importkø",
    emptyTitle: "Ingen elementer i denne statusen",
    emptyDetail: "Produkter fra Produktkjøper lander her etter import.",
  },
  desk: {
    errorTitle: "Kan ikke laste dagens oversikt",
    emptyTitle: "Ingen aktivitet i dag",
    emptyDetail: "Når AI og ordre kjører, oppdateres Rob's Desk her.",
  },
  marketing: {
    errorTitle: "Marketing Mission Control utilgjengelig",
    emptyTitle: "Ingen markedsføringsdata ennå",
    emptyDetail:
      "Når events fra butikken kommer inn, lærer Marketing-modulen av trafikk og konvertering.",
  },
  morningBrief: {
    errorTitle: "Ikke nok data til å lage Morning Brief",
    emptyTitle: "Ikke nok data til å lage Morning Brief",
    emptyDetail: "Brief bygges bare fra faktisk aktivitet.",
  },
  selfEval: {
    errorTitle: "Self Evaluation utilgjengelig",
    emptyTitle: "Ingen administratørhandlinger registrert",
    emptyDetail: "Ingen tilfeldig AI-tekst — kun faktiske observasjoner.",
  },
} as const;

export type AdminSurface = keyof typeof ADMIN_SURFACE_COPY;
