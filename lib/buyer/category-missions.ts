/**
 * Digital Buyer category missions — AI builds the category; Robin only chooses which.
 */

import type { MerchandiserShelf } from "@/lib/suppliers/merchandiser/types";
import type { SupplierSortBy } from "@/lib/suppliers/provider";

/** Massive mission sizes — Digital Buyer as purchasing department */
export type BuyerMissionSize = "quick" | "standard" | "deep" | "night";

/** @deprecated prefer BuyerMissionSize — kept for older clients */
export type BuyerQuantityChoice =
  | BuyerMissionSize
  | 10
  | 25
  | 50
  | 100
  | 500
  | "ai";

export type BuyerMissionStage =
  | "idle"
  | "connecting_suppliers"
  | "reading_profile"
  | "reading_memory"
  | "scanning"
  | "analyzing"
  | "filtering"
  | "scoring"
  | "seo"
  | "pricing"
  | "quality_gate"
  | "importing"
  | "review"
  | "paused"
  | "done"
  | "failed";

export const MISSION_SIZE_TARGETS: Record<BuyerMissionSize, number> = {
  quick: 500,
  standard: 10_000,
  deep: 100_000,
  /** Full-catalog night work — checkpoint continues across nights */
  night: 1_000_000,
};

export const MISSION_SIZE_OPTIONS: Array<{
  value: BuyerMissionSize;
  label: string;
  detail: string;
}> = [
  { value: "quick", label: "Quick", detail: "500 produkter" },
  { value: "standard", label: "Standard", detail: "10 000 produkter" },
  { value: "deep", label: "Deep Scan", detail: "100 000 produkter" },
  {
    value: "night",
    label: "Night Mission",
    detail: "Hele leverandørkatalogen (fortsetter over netter)",
  },
];

/** Live pipeline stages — never show vague "Jobber…" */
export const MISSION_STAGE_ORDER: BuyerMissionStage[] = [
  "connecting_suppliers",
  "reading_profile",
  "reading_memory",
  "scanning",
  "analyzing",
  "filtering",
  "scoring",
  "seo",
  "pricing",
  "quality_gate",
  "importing",
  "review",
  "done",
];

export type CategoryMissionDef = {
  id: string;
  emoji: string;
  label: string;
  /** Short pitch for Robin */
  brief: string;
  /** Merchandiser shelf used for scoring context */
  shelf: MerchandiserShelf;
  /** Subcategories AI will cover automatically */
  subcategories: string[];
  /** Search seeds — AI invents coverage; Robin never types these */
  seeds: Array<{ query: string; sortBy: SupplierSortBy; tier?: "premium" | "mid" | "budget" }>;
};

export const CATEGORY_MISSIONS: CategoryMissionDef[] = [
  {
    id: "gaming",
    emoji: "🎮",
    label: "Bygg Gaming",
    brief: "Komplett gaming-kategori: mus, tastatur, headset, matter, RGB, streaming og kontrollere.",
    shelf: "gaming",
    subcategories: [
      "Gamingmus",
      "Gamingtastatur",
      "Headset",
      "Musematter",
      "RGB",
      "Streaming",
      "Webkamera",
      "Kontrollere",
      "Tilbehør",
    ],
    seeds: [
      { query: "Gaming Mouse", sortBy: "bestsellers", tier: "mid" },
      { query: "Wireless Gaming Mouse", sortBy: "bestsellers", tier: "premium" },
      { query: "Gaming Keyboard", sortBy: "bestsellers", tier: "mid" },
      { query: "Mechanical Gaming Keyboard RGB", sortBy: "bestsellers", tier: "premium" },
      { query: "Gaming Headset", sortBy: "bestsellers", tier: "mid" },
      { query: "RGB Mouse Pad", sortBy: "bestsellers", tier: "budget" },
      { query: "Gaming Controller", sortBy: "bestsellers", tier: "mid" },
      { query: "Streaming Microphone", sortBy: "bestsellers", tier: "premium" },
      { query: "Webcam 1080p", sortBy: "bestsellers", tier: "mid" },
      { query: "RGB LED Strip Gaming", sortBy: "bestsellers", tier: "budget" },
      { query: "Gaming Chair Accessories", sortBy: "relevance", tier: "budget" },
      { query: "USB Sound Card Gaming", sortBy: "relevance", tier: "budget" },
    ],
  },
  {
    id: "mobil",
    emoji: "📱",
    label: "Bygg Mobil",
    brief: "Mobiltilbehør som passer ElectroHypeX — case, lading, powerbank, MagSafe.",
    shelf: "mobil",
    subcategories: [
      "Deksel",
      "Powerbank",
      "Ladere",
      "MagSafe",
      "Kabels",
      "Ørepropper",
      "Holdere",
    ],
    seeds: [
      { query: "Phone Case", sortBy: "bestsellers", tier: "budget" },
      { query: "MagSafe Charger", sortBy: "bestsellers", tier: "premium" },
      { query: "Power Bank", sortBy: "bestsellers", tier: "mid" },
      { query: "USB-C Fast Charger", sortBy: "bestsellers", tier: "mid" },
      { query: "Wireless Earbuds", sortBy: "bestsellers", tier: "mid" },
      { query: "Phone Holder Car", sortBy: "bestsellers", tier: "budget" },
      { query: "Tempered Glass Screen Protector", sortBy: "bestsellers", tier: "budget" },
    ],
  },
  {
    id: "kontor",
    emoji: "💻",
    label: "Bygg Kontor",
    brief: "Kontor og hjemmekontor — tastatur, webcam, stativ, hub.",
    shelf: "kontor",
    subcategories: [
      "Tastatur",
      "Mus",
      "Webcam",
      "Monitorstativ",
      "USB-hub",
      "Lamper",
      "Ergonomi",
    ],
    seeds: [
      { query: "Mechanical Keyboard", sortBy: "bestsellers", tier: "premium" },
      { query: "Wireless Office Mouse", sortBy: "bestsellers", tier: "mid" },
      { query: "Webcam", sortBy: "bestsellers", tier: "mid" },
      { query: "Monitor Stand", sortBy: "relevance", tier: "mid" },
      { query: "USB-C Hub Laptop", sortBy: "bestsellers", tier: "mid" },
      { query: "LED Desk Lamp", sortBy: "bestsellers", tier: "budget" },
      { query: "Laptop Stand Aluminum", sortBy: "bestsellers", tier: "premium" },
    ],
  },
  {
    id: "hjem",
    emoji: "🏠",
    label: "Bygg Hjem",
    brief: "Smart hjem og praktisk elektronikk for boligen.",
    shelf: "hjem",
    subcategories: ["Smart plug", "Belysning", "Sensorer", "Kabelføring", "Lyd"],
    seeds: [
      { query: "Smart Plug", sortBy: "bestsellers", tier: "budget" },
      { query: "LED Desk Lamp", sortBy: "bestsellers", tier: "mid" },
      { query: "Smart LED Bulb", sortBy: "bestsellers", tier: "budget" },
      { query: "Cable Management Box", sortBy: "relevance", tier: "budget" },
      { query: "Bluetooth Speaker", sortBy: "bestsellers", tier: "mid" },
    ],
  },
  {
    id: "audio",
    emoji: "🎧",
    label: "Bygg Audio",
    brief: "Headset, ørepropper, mikrofoner og høyttalere.",
    shelf: "elektronikk",
    subcategories: ["Headset", "Ørepropper", "Mikrofon", "Høyttaler", "DAC"],
    seeds: [
      { query: "Wireless Earbuds", sortBy: "bestsellers", tier: "mid" },
      { query: "Noise Cancelling Headphones", sortBy: "bestsellers", tier: "premium" },
      { query: "USB Microphone", sortBy: "bestsellers", tier: "mid" },
      { query: "Bluetooth Speaker", sortBy: "bestsellers", tier: "mid" },
      { query: "Gaming Headset", sortBy: "bestsellers", tier: "mid" },
    ],
  },
  {
    id: "streaming",
    emoji: "📷",
    label: "Bygg Streaming",
    brief: "Alt en streamer trenger — kamera, mic, lys, capture.",
    shelf: "gaming",
    subcategories: ["Webkamera", "Mikrofon", "Ring light", "Capture card", "Arm/stativ"],
    seeds: [
      { query: "Streaming Webcam 1080p", sortBy: "bestsellers", tier: "mid" },
      { query: "Ring Light Streaming", sortBy: "bestsellers", tier: "budget" },
      { query: "USB Microphone Streaming", sortBy: "bestsellers", tier: "premium" },
      { query: "Capture Card HDMI", sortBy: "bestsellers", tier: "mid" },
      { query: "Microphone Arm Boom", sortBy: "bestsellers", tier: "budget" },
    ],
  },
  {
    id: "tilbehor",
    emoji: "⌨",
    label: "Bygg Tilbehør",
    brief: "Kabels, hubs, adapters og småtilbehør som binder katalogen sammen.",
    shelf: "elektronikk",
    subcategories: ["USB-C", "HDMI", "Adapters", "Hubs", "Kabelføring"],
    seeds: [
      { query: "USB-C Hub", sortBy: "bestsellers", tier: "mid" },
      { query: "HDMI Cable 2.1", sortBy: "bestsellers", tier: "budget" },
      { query: "USB-C to HDMI Adapter", sortBy: "bestsellers", tier: "budget" },
      { query: "Wireless Charging Pad", sortBy: "bestsellers", tier: "mid" },
      { query: "Cable Organizer", sortBy: "relevance", tier: "budget" },
    ],
  },
];

export const QUANTITY_OPTIONS = MISSION_SIZE_OPTIONS;

export function getCategoryMission(id: string): CategoryMissionDef | null {
  return CATEGORY_MISSIONS.find((m) => m.id === id) || null;
}

export function isMissionSize(v: unknown): v is BuyerMissionSize {
  return v === "quick" || v === "standard" || v === "deep" || v === "night";
}

/** Resolve how many products to evaluate. */
export function resolveMissionTargetCount(
  choice: BuyerQuantityChoice | number | null | undefined,
  mission?: CategoryMissionDef | null
): number {
  if (isMissionSize(choice)) return MISSION_SIZE_TARGETS[choice];
  if (choice === "ai") {
    if (mission) {
      // Category build default = Standard scale
      return MISSION_SIZE_TARGETS.standard;
    }
    return MISSION_SIZE_TARGETS.quick;
  }
  if (typeof choice === "number" && Number.isFinite(choice)) {
    return Math.min(MISSION_SIZE_TARGETS.night, Math.max(10, Math.round(choice)));
  }
  return MISSION_SIZE_TARGETS.quick;
}

export function missionSizeFromTarget(n: number): BuyerMissionSize {
  if (n >= 500_000) return "night";
  if (n >= 50_000) return "deep";
  if (n >= 5_000) return "standard";
  return "quick";
}

export type RejectBucketId =
  | "too_few_images"
  | "low_margin"
  | "bad_delivery"
  | "low_stock"
  | "low_shop_match"
  | "duplicates"
  | "low_confidence"
  | "other";

export const REJECT_BUCKET_LABELS: Record<RejectBucketId, string> = {
  too_few_images: "Dårlige bilder",
  low_margin: "Lav margin",
  bad_delivery: "Lang levering",
  low_stock: "Lav lagerbeholdning",
  low_shop_match: "Ikke butikkmatch",
  duplicates: "Duplikat",
  low_confidence: "Lav confidence",
  other: "Annet",
};

export function bucketFilterReason(reason: string): RejectBucketId {
  const r = reason.toLowerCase();
  if (/bilde|bilder|image/.test(r)) return "too_few_images";
  if (/margin/.test(r)) return "low_margin";
  if (/lager|stock|inventory|beholdning/.test(r)) return "low_stock";
  if (/levering|delivery|shipping/.test(r)) return "bad_delivery";
  if (/butikk-match|butikkprofil|shop match|ikke butikk/.test(r))
    return "low_shop_match";
  if (/duplikat|duplicate/.test(r)) return "duplicates";
  if (/score|confidence|mangel|risiko/.test(r)) return "low_confidence";
  return "other";
}

export function emptyRejectBreakdown(): Record<RejectBucketId, number> {
  return {
    too_few_images: 0,
    low_margin: 0,
    bad_delivery: 0,
    low_stock: 0,
    low_shop_match: 0,
    duplicates: 0,
    low_confidence: 0,
    other: 0,
  };
}

export function mergeRejectReasons(
  breakdown: Record<RejectBucketId, number>,
  reasons: string[]
): Record<RejectBucketId, number> {
  const next = { ...breakdown };
  const list = Array.isArray(reasons) ? reasons : [];
  if (!list.length) {
    next.other += 1;
    return next;
  }
  // Count primary (first) reason to avoid double-counting one product
  const bucket = bucketFilterReason(list[0]);
  next[bucket] += 1;
  return next;
}

export type BuyerScanProgress = {
  stage: BuyerMissionStage;
  stageLabel: string;
  supplierLabel: string | null;
  seedQuery: string | null;
  current: number;
  total: number;
  kept: number;
  filtered: number;
  rejectBreakdown: Record<RejectBucketId, number>;
  categoryId: string | null;
  categoryLabel: string | null;
  subcategoryPlan: string[];
  quantityChoice: BuyerQuantityChoice | number | null;
  missionSize?: BuyerMissionSize | null;
  /** Live store-builder thoughts during / after re-rank */
  huntThinking?: {
    covered: string[];
    seeking: string[];
    updatedAt: string;
  } | null;
  /** Discovery Scheduler — what AI will search next */
  discoveryPlan?: {
    now: {
      familyId: string;
      label: string;
      groupId: string;
      groupLabel: string;
      query: string;
      reason: string;
    } | null;
    queue: Array<{
      familyId: string;
      label: string;
      groupId: string;
      groupLabel: string;
      query: string;
      reason: string;
    }>;
    groupSharePct: Array<{ groupId: string; label: string; pct: number }>;
    updatedAt: string;
    /** Latest explainable decision (validation log) */
    lastDecision?: import("@/lib/buyer/discovery-validation").DiscoveryDecisionRecord | null;
  } | null;
};

export type BuyerScanResultSummary = {
  analyzed: number;
  discarded: number;
  candidates: number;
  passedAi: number;
  passedQualityGate: number;
  imported: number;
  readyToPublish: number;
  published: number;
  approved: number;
  rejected: number;
  avgConfidence: number | null;
  durationSec: number | null;
  subcategoriesCovered: number;
  tierMix: { premium: number; mid: number; budget: number };
  missionSize?: BuyerMissionSize | null;
  categoryLabel?: string | null;
};

export type BuyerMissionHistoryRow = {
  id: string;
  date: string;
  category: string;
  missionSize: BuyerMissionSize | string;
  status: string;
  durationSec: number | null;
  analyzed: number;
  discarded: number;
  candidates: number;
  imported: number;
  published: number;
  approved: number;
  rejected: number;
  /** Why running/paused/failed — never leave Robin guessing at zeros */
  stopReason?: string | null;
};

export function stageLabel(
  stage: BuyerMissionStage,
  extra?: { supplier?: string | null; seed?: string | null }
): string {
  switch (stage) {
    case "connecting_suppliers":
      return "Kobler til leverandører…";
    case "reading_profile":
      return "Leser butikkprofil…";
    case "reading_memory":
      return "Leser Store Memory…";
    case "scanning":
      return extra?.supplier
        ? `Scanner produkter (${extra.supplier})…`
        : "Scanner produkter…";
    case "analyzing":
      return "Analyserer…";
    case "filtering":
      return "Forkaster…";
    case "scoring":
      return "Bygger AI-score…";
    case "seo":
      return "Genererer SEO…";
    case "pricing":
      return "Prissetter…";
    case "quality_gate":
      return "Quality Gate…";
    case "importing":
      return "Importerer…";
    case "review":
      return "Review — klare til deg…";
    case "paused":
      return "Pauset — fortsetter neste natt.";
    case "done":
      return "Ferdig.";
    case "failed":
      return "Stoppet med feil.";
    default:
      return "Forbereder…";
  }
}

export function parseScanRequest(raw: unknown): {
  progress: Partial<BuyerScanProgress>;
  result: BuyerScanResultSummary | null;
  huntReport: import("@/lib/buyer/hunt-report").ProductHuntReport | null;
  categoryId: string | null;
  missionSize: BuyerMissionSize | null;
} {
  const o = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const progress = (o.progress && typeof o.progress === "object"
    ? o.progress
    : {}) as Partial<BuyerScanProgress>;
  const result =
    o.result && typeof o.result === "object"
      ? (o.result as BuyerScanResultSummary)
      : null;
  let huntReport: import("@/lib/buyer/hunt-report").ProductHuntReport | null =
    null;
  if (o.huntReport && typeof o.huntReport === "object") {
    const hr = o.huntReport as { title?: string; scanRunId?: string };
    if (hr.title === "AI Product Hunt Report" && typeof hr.scanRunId === "string") {
      huntReport =
        o.huntReport as import("@/lib/buyer/hunt-report").ProductHuntReport;
    }
  }
  const missionSize = isMissionSize(o.missionSize)
    ? o.missionSize
    : isMissionSize(progress.missionSize)
      ? progress.missionSize
      : null;
  return {
    progress,
    result,
    huntReport,
    categoryId: typeof o.categoryId === "string" ? o.categoryId : null,
    missionSize,
  };
}
