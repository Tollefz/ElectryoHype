/**
 * Nightly AI self-review text for Real Store Mode.
 */

import type { ImproveRunStats } from "@/lib/improve/types";
import type { CatalogQaIssue } from "@/lib/real-store/types";

export function buildNightlyAiReview(input: {
  stats: ImproveRunStats;
  catalogIssues: CatalogQaIssue[];
  adminMinutesEst: number;
}): string {
  const good: string[] = [];
  const bad: string[] = [];
  const improve: string[] = [];
  const learned: string[] = [];

  if (input.stats.productsScored > 0) {
    good.push(
      `Scoret ${input.stats.productsScored} produkter (snitt ${input.stats.avgQualityBefore ?? "—"}/100).`
    );
  }
  if (input.stats.improvementsCreated > 0) {
    good.push(
      `Fant ${input.stats.improvementsCreated} konkrete forbedringsforslag.`
    );
  }
  if (input.stats.retirementProposed > 0) {
    good.push(
      `Identifiserte ${input.stats.retirementProposed} kandidater for pensjonering.`
    );
  }

  const highIssues = input.catalogIssues.filter((i) => i.severity === "high");
  if (highIssues.length) {
    bad.push(
      `Katalogfeil som krever handling: ${highIssues
        .map((i) => `${i.count} ${i.label}`)
        .join("; ")}.`
    );
  }
  if (input.stats.pendingApprovals > 15) {
    bad.push(
      `${input.stats.pendingApprovals} forslag venter — godkjenningshøyde kan bli flaskehals.`
    );
  }
  if (input.stats.productsScored < 20) {
    bad.push(
      "Tynn katalog — AI kan ikke validere treffsikkerhet før flere produkter er publisert."
    );
  }

  if (input.adminMinutesEst > 25) {
    improve.push(
      `Kan administratorarbeid automatiseres? Estimert ${input.adminMinutesEst} min/dag — vurder Autonomy SEMI og flere Self-Improve-godkjenninger.`
    );
  }
  if (highIssues.some((i) => i.id === "no_seo")) {
    improve.push("Prioriter SEO-forslag i Self-Improve til godkjenning.");
  }
  if (input.stats.improvementsCreated === 0 && input.stats.productsScored > 0) {
    improve.push(
      "Ingen nye forbedringsforslag — senk terskel eller importer flere produkter for signal."
    );
  }

  learned.push(
    "Administratorens godkjenninger/avvisninger mates inn i Trust learning loop."
  );
  if (input.stats.retirementProposed > 0) {
    learned.push(
      "Lav kvalitetsscore korrelerer med pensjoneringsforslag — hold Quality Gate streng."
    );
  }

  if (!good.length) good.push("Syklus fullført uten kritiske feil.");
  if (!bad.length) bad.push("Ingen kritiske avvik oppdaget.");
  if (!improve.length) improve.push("Fortsett dagens rytme på Rob's Desk.");

  return [
    "AI Review (natt):",
    "",
    "Hva gikk bra?",
    ...good.map((l) => `• ${l}`),
    "",
    "Hva gikk dårlig?",
    ...bad.map((l) => `• ${l}`),
    "",
    "Hva kan forbedres?",
    ...improve.map((l) => `• ${l}`),
    "",
    "Hva lærte jeg?",
    ...learned.map((l) => `• ${l}`),
  ].join("\n");
}
