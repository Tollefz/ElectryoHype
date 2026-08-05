/**
 * Morning brief generator for Rob's Desk — evidence only, no filler zeros.
 */

import type { AutonomyMode, AutonomyRunSummary } from "@/lib/autonomy/types";

function lineIf(n: number, label: string): string | null {
  if (!n || n <= 0) return null;
  return `${n.toLocaleString("no-NO")} ${label}`;
}

export function buildMorningBrief(input: {
  mode: AutonomyMode;
  summary: AutonomyRunSummary;
  storeHealthScore?: number | null;
}): string {
  const s = input.summary;
  const lines: string[] = ["God morgen.", ""];

  const facts = [
    lineIf(s.productsAnalyzed, "produkter analysert."),
    lineIf(s.newCandidatesFound, "nye produkter funnet."),
    lineIf(s.fittedProfile, "passer butikkprofilen."),
    input.mode === "off"
      ? lineIf(s.imported, "foreslått (modus OFF — ingen auto-import).")
      : lineIf(s.imported, "importert."),
    lineIf(s.passedQualityGate, "bestod Quality Gate."),
    lineIf(s.readyForPublish, "klare for publisering."),
    lineIf(s.priceUpdates, "pris-signaler på eksisterende produkter."),
    lineIf(s.outOfStock, "utsolgt / lagerendret."),
    lineIf(s.needImages, "trenger nye bilder."),
    lineIf(s.weakSeo, "har svak SEO."),
  ].filter((x): x is string => Boolean(x));

  if (facts.length === 0) {
    lines.push("Ingen målbar autonomi-aktivitet i denne kjøringen.");
    lines.push("Ikke nok data til detaljert brief.");
  } else {
    lines.push("Fra nattens kjøring:");
    lines.push("");
    lines.push(...facts);
  }

  lines.push("");
  if (s.criticalErrors === 0) {
    lines.push("Ingen kritiske feil funnet.");
  } else {
    lines.push(
      `${s.criticalErrors.toLocaleString("no-NO")} kritiske feil krever din oppmerksomhet.`
    );
  }

  if (input.storeHealthScore != null && Number.isFinite(input.storeHealthScore)) {
    lines.push("");
    lines.push(`Butikkhelse: ${Math.round(input.storeHealthScore)}/100.`);
  }

  lines.push("");
  lines.push(
    input.mode === "auto"
      ? "Modus: AUTO — jeg bygger til Review; du publiserer."
      : input.mode === "semi"
        ? "Modus: SEMI — jeg importerer; du publiserer."
        : "Modus: OFF — jeg foreslår kun."
  );

  return lines.join("\n");
}
