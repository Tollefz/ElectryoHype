/**
 * Human-friendly CJ / supplier API errors for admin UI.
 * Technical detail stays available behind «Vis detaljer».
 */

export type FriendlySupplierError = {
  title: string;
  body: string;
  detail: string | null;
  kind: "api_points" | "rate_limit" | "auth" | "network" | "other";
  /** Estimated local restart clock HH:mm (for daily quota), if applicable */
  estimatedRestart: string | null;
};

function nextMidnightLocal(): string {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

export function formatFriendlySupplierError(
  raw: string | null | undefined
): FriendlySupplierError | null {
  if (!raw || !String(raw).trim()) return null;
  const msg = String(raw).trim();
  const lower = msg.toLowerCase();

  if (
    /insufficient api points|api points|remaining:\s*0|used today/i.test(msg) ||
    lower.includes("poeng") && lower.includes("brukt")
  ) {
    return {
      kind: "api_points",
      title: "CJ API-poeng brukt opp",
      body: "Digital Buyer fortsetter automatisk når nye poeng er tilgjengelige.",
      detail: msg,
      estimatedRestart: nextMidnightLocal(),
    };
  }

  if (/rate limit|too many requests|429|qps/i.test(msg)) {
    return {
      kind: "rate_limit",
      title: "CJ midlertidig begrenset",
      body: "AI venter litt og prøver igjen automatisk.",
      detail: msg,
      estimatedRestart: null,
    };
  }

  if (/token|unauthorized|401|1600001|1600002/i.test(msg)) {
    return {
      kind: "auth",
      title: "CJ-tilkobling må fornyes",
      body: "AI prøver å hente ny tilgangsnøkkel. Sjekk CJ-nøkler hvis dette vedvarer.",
      detail: msg,
      estimatedRestart: null,
    };
  }

  if (/network|timeout|econnreset|fetch failed/i.test(msg)) {
    return {
      kind: "network",
      title: "Nettverksfeil mot leverandør",
      body: "AI prøver igjen. Ingen handling nødvendig med mindre dette varer.",
      detail: msg,
      estimatedRestart: null,
    };
  }

  return {
    kind: "other",
    title: "Leverandørfeil",
    body: "Noe gikk galt hos CJ. Se detaljer om du trenger dem.",
    detail: msg,
    estimatedRestart: null,
  };
}

export function isApiPointsExhausted(raw: string | null | undefined): boolean {
  return formatFriendlySupplierError(raw)?.kind === "api_points";
}
