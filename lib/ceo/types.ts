/**
 * Rob CEO — store managing director types.
 * Facts only. Never invents. Never executes — Approval Gate only.
 */

export type CeoDomain =
  | "buyer"
  | "marketing"
  | "orders"
  | "finance"
  | "seo"
  | "customer"
  | (string & {});

export type CeoPriority = "critical" | "high" | "medium" | "low";

/** One prioritized fact from a domain AI — never invented. */
export type CeoInsight = {
  id: string;
  domain: CeoDomain;
  priority: CeoPriority;
  /** Short Norwegian headline for the morning letter */
  headline: string;
  why: string;
  /** Which concrete data / counts this rests on */
  data: string;
  /** 0–100 — derived from source severity/tone, never guessed beyond that */
  confidence: number;
  /** Which brain delivered the insight */
  sourceAi: string;
  href?: string;
  productId?: string;
  orderId?: string;
};

export type CeoGateActionId = "publish" | "ignore" | "details";

export type CeoGateAction = {
  id: CeoGateActionId;
  label: string;
  /** Where to go — Rob never executes; human navigates */
  href?: string;
};

/** Proposal for the Approval Gate — recommend only. */
export type CeoProposal = {
  id: string;
  domain: CeoDomain;
  headline: string;
  why: string;
  data: string;
  confidence: number;
  sourceAi: string;
  actions: CeoGateAction[];
  href?: string;
  productId?: string;
  orderId?: string;
};

export type CeoDomainSection = {
  domain: CeoDomain;
  label: string;
  sourceAi: string;
  /** Empty → "Ingen kritiske funn i dag." */
  lines: Array<{
    headline: string;
    why: string;
    data: string;
    confidence: number;
  }>;
  ok: boolean;
  error?: string;
};

export type CeoMorningBrief = {
  greeting: string;
  intro: string;
  generatedAt: string;
  sections: CeoDomainSection[];
  /** Story paragraphs for natural reading */
  storyParagraphs: string[];
  /** Top priorities across domains (not a dump) */
  priorities: CeoInsight[];
  proposals: CeoProposal[];
  closing: string;
};

export type CeoDeskStatus = {
  status: "ready" | "partial" | "waiting" | "error";
  brief: CeoMorningBrief;
  sourceErrors: Partial<Record<CeoDomain, string>>;
};
