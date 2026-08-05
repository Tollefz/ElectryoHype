/**
 * AI Council — shared protocol between management-team brains.
 * No new AIs: collaboration layer only. Facts in, proposals out.
 */

/** Stable member ids. New modules add a new id via registerCouncilMember. */
export type CouncilMemberId =
  | "buyer"
  | "marketing"
  | "orders"
  | "finance"
  | "seo"
  | "customer"
  | (string & {});

export type CouncilPriority = "critical" | "high" | "medium" | "low";

/**
 * Decisions that always require a human — never auto-executed by any member or Rob.
 */
export type HumanApprovalKind =
  | "publish_product"
  | "spend_ads"
  | "change_price"
  | "refund_or_cancel"
  | "send_email"
  | "generate_seo_content"
  | "import_product"
  | "other_store_change";

/**
 * Envelope every brain uses when sending an insight to Rob.
 * Rob never invents fields — members populate from their own facts.
 */
export type CouncilInsight = {
  id: string;
  memberId: CouncilMemberId;
  sourceAi: string;
  priority: CouncilPriority;
  headline: string;
  why: string;
  /** Concrete counts / ids / metrics — never narrative fluff alone */
  data: string;
  /** 0–100, derived from source severity/tone */
  confidence: number;
  /** Observation vs actionable proposal */
  kind: "observation" | "proposal";
  /** If proposal: which human gate it maps to */
  requiresApproval?: HumanApprovalKind;
  href?: string;
  productId?: string;
  orderId?: string;
  customerId?: string;
};

export type CouncilMemberHealth =
  | "ready"
  | "learning"
  | "waiting"
  | "error"
  | "offline";

export type CouncilMemberReport = {
  memberId: CouncilMemberId;
  label: string;
  sourceAi: string;
  health: CouncilMemberHealth;
  /** One-line fact status for Mission Control */
  summary: string;
  insights: CouncilInsight[];
  error?: string;
  collectedAt: string;
};

export type CouncilMemberDefinition = {
  memberId: CouncilMemberId;
  label: string;
  sourceAi: string;
  /** Anchor on Rob's Desk for «Vis detaljer» */
  deskHref: string;
  /**
   * Collect facts → insights. Must not invent.
   * Must not execute store mutations.
   */
  collect: () => Promise<Omit<CouncilMemberReport, "memberId" | "label" | "sourceAi" | "collectedAt"> & {
    insights: CouncilInsight[];
  }>;
};

export type CouncilSession = {
  convenedAt: string;
  members: CouncilMemberReport[];
  /** Flat list of all insights from successful members */
  insights: CouncilInsight[];
  /** Members that failed to report */
  failures: Array<{ memberId: CouncilMemberId; error: string }>;
};

/**
 * One Mission Control status for the whole management team.
 */
export type AiManagementMissionStatus = {
  generatedAt: string;
  overall: "green" | "amber" | "red" | "grey";
  headline: string;
  narrative: string;
  memberCount: number;
  reportingCount: number;
  criticalCount: number;
  proposalCount: number;
  members: Array<{
    memberId: CouncilMemberId;
    label: string;
    sourceAi: string;
    health: CouncilMemberHealth;
    summary: string;
    insightCount: number;
    topHeadline: string | null;
    href: string;
  }>;
  /** Top priorities Rob should surface (already sorted) */
  topPriorities: CouncilInsight[];
  session: CouncilSession;
};
