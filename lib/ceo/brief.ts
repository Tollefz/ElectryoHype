/**
 * Build Rob CEO morning brief — natural Norwegian, facts only.
 * Sections come from AI Council members (extensible).
 */

import type {
  CeoDomain,
  CeoDomainSection,
  CeoInsight,
  CeoMorningBrief,
  CeoProposal,
} from "./types";
import { pickDomainLines, pickGlobalPriorities } from "./prioritize";
import { buildCeoProposals } from "./proposals";

export type CeoBriefMemberInput = {
  domain: CeoDomain;
  label: string;
  sourceAi: string;
  insights: CeoInsight[];
  error?: string;
};

function greetingForHour(hour: number): string {
  if (hour < 5) return "Hei — nattevakt fortsatt på.";
  if (hour < 12) return "God morgen.";
  if (hour < 18) return "God dag.";
  return "God kveld.";
}

export function buildCeoMorningBrief(input: {
  members: CeoBriefMemberInput[];
  hour?: number;
}): CeoMorningBrief {
  const hour = input.hour ?? new Date().getHours();
  const greeting = greetingForHour(hour);
  const members = input.members || [];

  const sections: CeoDomainSection[] = members.map((m) => {
    const picked = pickDomainLines(m.insights || []);
    return {
      domain: m.domain,
      label: m.label,
      sourceAi: m.sourceAi,
      ok: !m.error,
      error: m.error,
      lines: picked.map((i) => ({
        headline: i.headline,
        why: i.why,
        data: i.data,
        confidence: i.confidence,
      })),
    };
  });

  const allInsights = members.flatMap((m) => m.insights || []);
  const priorities = pickGlobalPriorities(allInsights);
  const proposals = buildCeoProposals(priorities);

  const storyParagraphs: string[] = [greeting, "Jeg analyserte butikken."];

  for (const section of sections) {
    storyParagraphs.push(`${section.label}:`);
    if (section.error) {
      storyParagraphs.push(
        `Kunne ikke lese ${section.sourceAi} (${section.error}). Jeg finner ikke på noe.`
      );
      continue;
    }
    if (section.lines.length === 0) {
      storyParagraphs.push("Ingen kritiske funn i dag.");
      continue;
    }
    for (const line of section.lines) {
      storyParagraphs.push(line.headline);
    }
  }

  const criticalCount = priorities.filter((p) => p.priority === "critical").length;
  const closing =
    criticalCount > 0
      ? `Jeg foreslår ${proposals.length} handling${proposals.length === 1 ? "" : "er"} under Approval Gate. Jeg utfører ingenting — du bestemmer.`
      : proposals.length > 0
        ? `Noen forslag venter på deg. Jeg endrer ikke katalog, ads, priser eller ordre uten din godkjenning.`
        : `Ingen kritiske beslutninger akkurat nå. Jeg fortsetter å lese fakta.`;

  return {
    greeting,
    intro: "Jeg analyserte butikken.",
    generatedAt: new Date().toISOString(),
    sections,
    storyParagraphs,
    priorities,
    proposals,
    closing,
  };
}

const FALLBACK_MEMBERS: CeoBriefMemberInput[] = [
  { domain: "buyer", label: "Buyer", sourceAi: "Buyer Brain", insights: [] },
  {
    domain: "marketing",
    label: "Marketing",
    sourceAi: "Marketing Brain",
    insights: [],
  },
  { domain: "orders", label: "Orders", sourceAi: "Order Brain", insights: [] },
  {
    domain: "finance",
    label: "Finance",
    sourceAi: "Finance Brain",
    insights: [],
  },
  { domain: "seo", label: "SEO", sourceAi: "SEO Brain", insights: [] },
  {
    domain: "customer",
    label: "Customer",
    sourceAi: "Customer Brain",
    insights: [],
  },
];

export function emptyCeoBrief(reason?: string): CeoMorningBrief {
  return buildCeoMorningBrief({
    members: FALLBACK_MEMBERS.map((m) => ({
      ...m,
      error: reason,
    })),
  });
}

/** Re-export for callers that build proposals separately */
export type { CeoProposal, CeoInsight };
