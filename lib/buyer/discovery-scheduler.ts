/**
 * Discovery Scheduler — decides WHICH product family to search next.
 *
 * Sits between CJ catalog and the product scanner:
 *   CJ → Discovery Scheduler → Scanner → Candidates → Merch Score
 *
 * Never lifts a bad product. Only steers search CPU toward store gaps.
 * Within-hunt fatigue / cooldown / group share reset every new hunt.
 */

import "server-only";

import type { ScanSeed } from "@/lib/suppliers/merchandiser/seeds";
import type { MerchandiserShelf } from "@/lib/suppliers/merchandiser/types";
import type { SupplierSortBy } from "@/lib/suppliers/provider";
import {
  familyTier,
  primaryGroupForFamily,
  type CustomFocusFamily,
  type FocusStars,
} from "@/lib/buyer/product-focus-core";
import {
  HUNT_GROUP_QUOTAS,
  huntFatigueMultiplier,
  scoreFamilyNeedV3,
} from "@/lib/buyer/hunt-store-builder";
import type {
  AssortmentBoundsInput,
  CatalogAssortmentSnapshot,
} from "@/lib/buyer/assortment-score";
import {
  buildDiscoveryDecisionRecord,
  formatDiscoveryDecisionLog,
  type DiscoveryDecisionRecord,
  type DiscoveryFamilyFactorInput,
  type DiscoveryObservedMetrics,
} from "@/lib/buyer/discovery-validation";
import { logInfo } from "@/lib/utils/logger";

export type DiscoveryFamilyDef = {
  familyId: string;
  label: string;
  groupId: string;
  queries: string[];
  shelf: MerchandiserShelf;
  sortBy: SupplierSortBy;
};

export type DiscoveryState = {
  /** Evaluated products attributed to each family this hunt */
  familyScanCounts: Record<string, number>;
  groupScanCounts: Record<string, number>;
  /** Recent family picks for cooldown */
  recentFamilies: string[];
  /** Rotate query variants per family */
  queryVariantIdx: Record<string, number>;
  currentFamilyId: string | null;
  currentQuery: string | null;
  pagesOnCurrent: number;
  /** Consecutive empty CJ pages — advance supplier when ≥ family count */
  emptyStreak: number;
};

export type DiscoveryQueueItem = {
  familyId: string;
  label: string;
  groupId: string;
  groupLabel: string;
  query: string;
  needScore: number;
  reason: string;
};

export type DiscoveryPlan = {
  now: DiscoveryQueueItem | null;
  queue: DiscoveryQueueItem[];
  groupSharePct: Array<{ groupId: string; label: string; pct: number }>;
  updatedAt: string;
  /** Latest decision explanation (validation / logging) */
  lastDecision?: DiscoveryDecisionRecord | null;
};

const GROUP_SHELF: Record<string, MerchandiserShelf> = {
  pc_gaming: "gaming",
  mobil: "mobil",
  streaming: "gaming",
  kontor: "kontor",
  tv_lyd: "elektronikk",
  smart_home: "hjem",
  foto: "elektronikk",
  bil: "elektronikk",
  maker: "elektronikk",
};

const GROUP_LABEL: Record<string, string> = {
  pc_gaming: "Gaming",
  mobil: "Mobil",
  streaming: "Streaming",
  kontor: "Kontor",
  tv_lyd: "TV & Lyd",
  smart_home: "Smart Home",
  foto: "Foto",
  bil: "Bil",
  maker: "Maker",
  data_it: "Data & IT",
};

/** English CJ keywords per family — Discovery Scheduler picks among these. */
export const DISCOVERY_FAMILY_QUERIES: DiscoveryFamilyDef[] = [
  // Gaming core
  { familyId: "gaming_mouse", label: "Gamingmus", groupId: "pc_gaming", queries: ["Gaming Mouse", "Wireless Gaming Mouse", "RGB Gaming Mouse"], shelf: "gaming", sortBy: "bestsellers" },
  { familyId: "gaming_keyboard", label: "Gamingtastatur", groupId: "pc_gaming", queries: ["Gaming Keyboard", "Mechanical Gaming Keyboard", "RGB Keyboard"], shelf: "gaming", sortBy: "bestsellers" },
  { familyId: "mechanical_keyboard", label: "Mekanisk tastatur", groupId: "pc_gaming", queries: ["Mechanical Keyboard", "Hot Swap Keyboard"], shelf: "gaming", sortBy: "bestsellers" },
  { familyId: "headset", label: "Gamingheadset", groupId: "pc_gaming", queries: ["Gaming Headset", "Wireless Gaming Headset"], shelf: "gaming", sortBy: "bestsellers" },
  { familyId: "mouse_pad", label: "Musematte", groupId: "pc_gaming", queries: ["RGB Mouse Pad", "Gaming Mouse Pad", "Desk Mat"], shelf: "gaming", sortBy: "bestsellers" },
  { familyId: "led_lighting", label: "RGB", groupId: "pc_gaming", queries: ["RGB LED Strip", "PC RGB Light", "Desk RGB Light"], shelf: "gaming", sortBy: "bestsellers" },
  { familyId: "ssd", label: "SSD", groupId: "data_it", queries: ["NVMe SSD", "External SSD", "Portable SSD"], shelf: "elektronikk", sortBy: "bestsellers" },
  { familyId: "ram", label: "RAM", groupId: "data_it", queries: ["DDR4 RAM", "DDR5 RAM", "Desktop Memory"], shelf: "elektronikk", sortBy: "bestsellers" },
  { familyId: "usb_c_hub", label: "USB-C Hub", groupId: "data_it", queries: ["USB-C Hub", "USB C Docking Hub", "Multiport USB-C Hub"], shelf: "kontor", sortBy: "bestsellers" },
  { familyId: "docking_station", label: "Docking", groupId: "data_it", queries: ["USB-C Docking Station", "Laptop Docking Station"], shelf: "kontor", sortBy: "bestsellers" },
  { familyId: "controller", label: "Kontroller", groupId: "pc_gaming", queries: ["Game Controller", "Wireless Gamepad", "PC Controller"], shelf: "gaming", sortBy: "bestsellers" },
  { familyId: "capture_card", label: "Capture Card", groupId: "pc_gaming", queries: ["Capture Card", "4K Capture Card", "HDMI Capture Card"], shelf: "gaming", sortBy: "bestsellers" },
  { familyId: "stream_deck", label: "Stream Deck", groupId: "pc_gaming", queries: ["Stream Deck", "Macro Pad", "Stream Controller"], shelf: "gaming", sortBy: "relevance" },
  { familyId: "webcam", label: "Webkamera", groupId: "pc_gaming", queries: ["Webcam", "1080p Webcam", "Streaming Webcam"], shelf: "kontor", sortBy: "bestsellers" },
  { familyId: "microphone", label: "Mikrofon", groupId: "streaming", queries: ["USB Microphone", "Condenser Microphone", "Streaming Microphone"], shelf: "gaming", sortBy: "bestsellers" },
  { familyId: "monitor_arm", label: "Monitorarm", groupId: "kontor", queries: ["Monitor Arm", "Gas Spring Monitor Mount"], shelf: "kontor", sortBy: "bestsellers" },
  { familyId: "case_fan", label: "Kabinettvifte", groupId: "pc_gaming", queries: ["PC Case Fan", "RGB Case Fan"], shelf: "gaming", sortBy: "bestsellers" },
  { familyId: "cpu_cooler", label: "CPU-kjøler", groupId: "pc_gaming", queries: ["CPU Cooler", "AIO Liquid Cooler"], shelf: "gaming", sortBy: "bestsellers" },
  // Mobil
  { familyId: "powerbank", label: "Powerbank", groupId: "mobil", queries: ["Power Bank", "Fast Charge Power Bank", "20000mAh Power Bank"], shelf: "mobil", sortBy: "bestsellers" },
  { familyId: "magsafe", label: "MagSafe", groupId: "mobil", queries: ["MagSafe Charger", "MagSafe Power Bank", "MagSafe Mount"], shelf: "mobil", sortBy: "bestsellers" },
  { familyId: "charger", label: "Hurtiglader", groupId: "mobil", queries: ["GaN Charger", "USB-C Fast Charger", "65W Charger"], shelf: "mobil", sortBy: "bestsellers" },
  { familyId: "usb_c_cable", label: "USB-C kabel", groupId: "mobil", queries: ["USB-C Cable", "USB C to USB C Cable"], shelf: "mobil", sortBy: "bestsellers" },
  { familyId: "qi_charger", label: "Qi-lader", groupId: "mobil", queries: ["Wireless Charger", "Qi Wireless Charger"], shelf: "mobil", sortBy: "bestsellers" },
  { familyId: "phone_mount", label: "Telefonholder", groupId: "mobil", queries: ["Phone Holder", "Car Phone Mount"], shelf: "mobil", sortBy: "bestsellers" },
  // Streaming
  { familyId: "boom_arm", label: "Boom arm", groupId: "streaming", queries: ["Microphone Boom Arm", "Mic Arm"], shelf: "gaming", sortBy: "bestsellers" },
  { familyId: "ring_light", label: "Ring light", groupId: "streaming", queries: ["Ring Light", "LED Ring Light"], shelf: "hjem", sortBy: "bestsellers" },
  { familyId: "green_screen", label: "Green screen", groupId: "streaming", queries: ["Green Screen", "Chroma Key Backdrop"], shelf: "gaming", sortBy: "relevance" },
  { familyId: "audio_interface", label: "Lydkort", groupId: "streaming", queries: ["USB Audio Interface", "Audio Interface"], shelf: "elektronikk", sortBy: "relevance" },
  // Smart home
  { familyId: "smart_plug", label: "Smart Plug", groupId: "smart_home", queries: ["Smart Plug", "WiFi Smart Plug"], shelf: "hjem", sortBy: "bestsellers" },
  { familyId: "smart_bulb", label: "Smart Lights", groupId: "smart_home", queries: ["Smart Bulb", "WiFi LED Bulb"], shelf: "hjem", sortBy: "bestsellers" },
  { familyId: "security_camera", label: "Overvåkningskamera", groupId: "smart_home", queries: ["Security Camera", "WiFi Camera", "IP Camera"], shelf: "hjem", sortBy: "bestsellers" },
  { familyId: "smart_sensor", label: "Smartsensor", groupId: "smart_home", queries: ["Smart Motion Sensor", "Door Sensor"], shelf: "hjem", sortBy: "relevance" },
  { familyId: "doorbell", label: "Dørklokke", groupId: "smart_home", queries: ["Video Doorbell", "Smart Doorbell"], shelf: "hjem", sortBy: "bestsellers" },
  // Kontor
  { familyId: "ergonomic_mouse", label: "Ergonomisk mus", groupId: "kontor", queries: ["Ergonomic Mouse", "Vertical Mouse"], shelf: "kontor", sortBy: "bestsellers" },
  { familyId: "laptop_stand", label: "Laptopstativ", groupId: "kontor", queries: ["Laptop Stand", "Notebook Stand"], shelf: "kontor", sortBy: "bestsellers" },
  { familyId: "cable_management", label: "Kabelorganisering", groupId: "kontor", queries: ["Cable Management", "Cable Tray", "Cable Clips"], shelf: "kontor", sortBy: "relevance" },
  { familyId: "office_keyboard", label: "Kontortastatur", groupId: "kontor", queries: ["Office Keyboard", "Wireless Keyboard"], shelf: "kontor", sortBy: "bestsellers" },
  // TV & lyd
  { familyId: "bluetooth_speaker", label: "Bluetooth-høyttaler", groupId: "tv_lyd", queries: ["Bluetooth Speaker", "Portable Bluetooth Speaker"], shelf: "elektronikk", sortBy: "bestsellers" },
  { familyId: "pc_speaker", label: "PC-høyttaler", groupId: "tv_lyd", queries: ["PC Speakers", "Computer Speakers"], shelf: "elektronikk", sortBy: "bestsellers" },
  { familyId: "hdmi_cable", label: "HDMI-kabel", groupId: "tv_lyd", queries: ["HDMI Cable", "HDMI 2.1 Cable"], shelf: "elektronikk", sortBy: "bestsellers" },
  { familyId: "displayport_cable", label: "DisplayPort", groupId: "tv_lyd", queries: ["DisplayPort Cable", "DP Cable"], shelf: "elektronikk", sortBy: "bestsellers" },
  { familyId: "soundbar", label: "Soundbar", groupId: "tv_lyd", queries: ["Soundbar", "TV Soundbar"], shelf: "elektronikk", sortBy: "bestsellers" },
  // Maker / lagring
  { familyId: "nas", label: "NAS", groupId: "data_it", queries: ["NAS Storage", "Network Attached Storage"], shelf: "elektronikk", sortBy: "relevance" },
  { familyId: "mini_pc", label: "Mini-PC", groupId: "data_it", queries: ["Mini PC", "Mini Computer"], shelf: "elektronikk", sortBy: "bestsellers" },
  { familyId: "precision_tools", label: "Presisjonsverktøy", groupId: "maker", queries: ["Precision Screwdriver Set", "Electronics Repair Kit"], shelf: "elektronikk", sortBy: "bestsellers" },
  { familyId: "printer_3d", label: "3D-printer", groupId: "maker", queries: ["3D Printer", "3D Printing Filament"], shelf: "elektronikk", sortBy: "relevance" },
];

export function emptyDiscoveryState(): DiscoveryState {
  return {
    familyScanCounts: {},
    groupScanCounts: {},
    recentFamilies: [],
    queryVariantIdx: {},
    currentFamilyId: null,
    currentQuery: null,
    pagesOnCurrent: 0,
    emptyStreak: 0,
  };
}

export function parseDiscoveryState(raw: unknown): DiscoveryState {
  const base = emptyDiscoveryState();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    familyScanCounts:
      o.familyScanCounts && typeof o.familyScanCounts === "object"
        ? (o.familyScanCounts as Record<string, number>)
        : {},
    groupScanCounts:
      o.groupScanCounts && typeof o.groupScanCounts === "object"
        ? (o.groupScanCounts as Record<string, number>)
        : {},
    recentFamilies: Array.isArray(o.recentFamilies)
      ? o.recentFamilies.map(String).slice(-30)
      : [],
    queryVariantIdx:
      o.queryVariantIdx && typeof o.queryVariantIdx === "object"
        ? (o.queryVariantIdx as Record<string, number>)
        : {},
    currentFamilyId:
      typeof o.currentFamilyId === "string" ? o.currentFamilyId : null,
    currentQuery: typeof o.currentQuery === "string" ? o.currentQuery : null,
    pagesOnCurrent: Math.max(0, Number(o.pagesOnCurrent || 0)),
    emptyStreak: Math.max(0, Number(o.emptyStreak || 0)),
  };
}

function catalogFamilies(
  customs: CustomFocusFamily[]
): DiscoveryFamilyDef[] {
  const out = [...DISCOVERY_FAMILY_QUERIES];
  for (const c of customs) {
    if (out.some((f) => f.familyId === c.id)) continue;
    const keywords = c.keywords.length ? c.keywords : [c.label];
    out.push({
      familyId: c.id,
      label: c.label,
      groupId: c.groupId || "maker",
      queries: keywords.map((k) => k.slice(0, 60)),
      shelf: GROUP_SHELF[c.groupId] || "elektronikk",
      sortBy: "bestsellers",
    });
  }
  return out;
}

function groupLabel(groupId: string): string {
  return GROUP_LABEL[groupId] || groupId;
}

export type ResolveDiscoveryInput = {
  state: DiscoveryState;
  snapshot: CatalogAssortmentSnapshot;
  targets: Record<string, number>;
  bounds: Record<string, AssortmentBoundsInput>;
  starsByFamily: Record<string, FocusStars | number>;
  customFamilies?: CustomFocusFamily[];
  /** Force advance to a new family (empty page / enough pages) */
  forceAdvance?: boolean;
  cooldownGap?: number;
  queueSize?: number;
  /** Category mission: only explore families on this shelf */
  allowedShelves?: MerchandiserShelf[] | null;
  allowedGroupIds?: string[] | null;
  /** Observed product averages by family — logging only, not used for pick */
  observedByFamily?: Record<string, DiscoveryObservedMetrics> | null;
};

export type ResolveDiscoveryResult = {
  seed: ScanSeed & { familyId: string; label: string; groupId: string };
  state: DiscoveryState;
  plan: DiscoveryPlan;
  /** Validation record for this resolve (also on plan.lastDecision) */
  decision: DiscoveryDecisionRecord | null;
};

function scoreDiscoveryFamily(
  def: DiscoveryFamilyDef,
  input: ResolveDiscoveryInput
): DiscoveryFamilyFactorInput {
  const bound = input.bounds[def.familyId];
  const target =
    bound?.target ??
    (input.targets[def.familyId] != null ? input.targets[def.familyId] : null);
  const catalogHave = input.snapshot.byFamily[def.familyId] || 0;
  const batch = input.state.familyScanCounts[def.familyId] || 0;
  const stars = Number(input.starsByFamily[def.familyId] ?? 0);
  const totalScanned = Math.max(
    1,
    Object.values(input.state.familyScanCounts).reduce((a, b) => a + b, 0)
  );
  const groupScanned = input.state.groupScanCounts[def.groupId] || 0;
  const groupShare = groupScanned / totalScanned;
  const groupQuota = HUNT_GROUP_QUOTAS[def.groupId] ?? 0.08;
  const cooldownGap = input.cooldownGap ?? 2;
  const onCooldown =
    input.state.recentFamilies.length > 0 &&
    input.state.recentFamilies.slice(-cooldownGap).includes(def.familyId);

  const need = scoreFamilyNeedV3({
    have: catalogHave,
    target,
    batchCount: batch,
    focusStars: stars,
    softMax: bound?.softMax ?? null,
    groupShare,
    groupQuota,
    onCooldown,
  });

  // Prefer core families slightly in discovery
  const tierBoost =
    familyTier(def.familyId, input.customFamilies || []) === "core" ? 1.08 : 1;

  let reason = "Balanserer sortiment";
  if (catalogHave === 0) reason = "Familien mangler helt i butikken";
  else if (target != null && catalogHave < target * 0.5)
    reason = "Sterkt underdekket i sortiment";
  else if (stars >= 4) reason = "Høyt Produktfokus";
  else if (onCooldown) reason = "Cooldown — bytter familie";
  else if (groupShare > groupQuota * 1.5)
    reason = "Gruppe over kvote — lavere prioritet";

  return {
    familyId: def.familyId,
    label: def.label,
    groupId: def.groupId,
    groupLabel: groupLabel(def.groupId),
    needScore: need * tierBoost,
    reason,
    catalogHave,
    target,
    batchCount: batch,
    focusStars: stars,
    onCooldown,
    groupShare,
    groupQuota,
  };
}

function buildRankedQueue(
  input: ResolveDiscoveryInput
): Array<DiscoveryQueueItem & { def: DiscoveryFamilyDef; factors: DiscoveryFamilyFactorInput }> {
  let defs = catalogFamilies(input.customFamilies || []);
  if (input.allowedShelves?.length) {
    const set = new Set(input.allowedShelves);
    defs = defs.filter((d) => set.has(d.shelf));
  }
  if (input.allowedGroupIds?.length) {
    const set = new Set(input.allowedGroupIds);
    defs = defs.filter((d) => set.has(d.groupId));
  }
  if (!defs.length) defs = catalogFamilies(input.customFamilies || []);

  const ranked = defs
    .map((def) => {
      const factors = scoreDiscoveryFamily(def, input);
      const vIdx = input.state.queryVariantIdx[def.familyId] || 0;
      const query = def.queries[vIdx % def.queries.length] || def.queries[0];
      return {
        familyId: def.familyId,
        label: def.label,
        groupId: def.groupId,
        groupLabel: groupLabel(def.groupId),
        query,
        needScore: factors.needScore,
        reason: factors.reason,
        def,
        factors,
      };
    })
    .sort((a, b) => b.needScore - a.needScore);

  return ranked;
}

/**
 * Pick next CJ search seed from Discovery Scheduler.
 * Call before each searchProducts — or when advancing after empty page.
 */
export function resolveNextDiscoverySeed(
  input: ResolveDiscoveryInput
): ResolveDiscoveryResult {
  const state = { ...input.state };
  const queueSize = input.queueSize ?? 6;
  let ranked = buildRankedQueue({ ...input, state });

  // Stay on current family for a few pages unless forceAdvance / fatigue heavy
  const stay =
    !input.forceAdvance &&
    state.currentFamilyId &&
    state.pagesOnCurrent > 0 &&
    state.pagesOnCurrent < 3 &&
    huntFatigueMultiplier(state.familyScanCounts[state.currentFamilyId] || 0) >=
      0.75;

  let chosen = ranked[0];

  // Empty page / finished pages → must leave current family
  if (input.forceAdvance && state.currentFamilyId) {
    const alt = ranked.find((r) => r.familyId !== state.currentFamilyId);
    if (alt) chosen = alt;
  } else if (stay) {
    const cur = ranked.find((r) => r.familyId === state.currentFamilyId);
    if (cur && cur.needScore > ranked[0].needScore * 0.45) {
      chosen = cur;
    }
  }

  if (!chosen) {
    const fallback = DISCOVERY_FAMILY_QUERIES[0];
    const factors = scoreDiscoveryFamily(fallback, { ...input, state });
    chosen = {
      familyId: fallback.familyId,
      label: fallback.label,
      groupId: fallback.groupId,
      groupLabel: groupLabel(fallback.groupId),
      query: fallback.queries[0],
      needScore: factors.needScore,
      reason: "Fallback",
      def: fallback,
      factors: { ...factors, reason: "Fallback" },
    };
  }

  // New family → rotate query variant & record cooldown history
  const switchedFamily = state.currentFamilyId !== chosen.familyId;
  if (switchedFamily) {
    const prev = state.queryVariantIdx[chosen.familyId] || 0;
    state.queryVariantIdx = {
      ...state.queryVariantIdx,
      [chosen.familyId]: prev + 1,
    };
    const vIdx = state.queryVariantIdx[chosen.familyId];
    chosen = {
      ...chosen,
      query:
        chosen.def.queries[vIdx % chosen.def.queries.length] ||
        chosen.def.queries[0],
    };
    state.recentFamilies = [
      ...state.recentFamilies.filter((f) => f !== chosen.familyId),
      chosen.familyId,
    ].slice(-30);
    state.pagesOnCurrent = 0;
  }

  state.currentFamilyId = chosen.familyId;
  state.currentQuery = chosen.query;
  state.pagesOnCurrent = (state.pagesOnCurrent || 0) + 1;

  // Validation log — does not change the choice above
  const decision = buildDiscoveryDecisionRecord({
    chosen: chosen.factors,
    ranked: ranked.map((r) => r.factors),
    switchedFamily,
    pagesOnCurrent: state.pagesOnCurrent,
    forceAdvance: Boolean(input.forceAdvance),
    query: chosen.query,
    observedByFamily: input.observedByFamily || null,
  });
  const decisionText = formatDiscoveryDecisionLog(decision);
  console.log(`[buyer/discovery]\n${decisionText}`);
  logInfo(decisionText, "[buyer/discovery]");

  // Rebuild queue preview after choice (exclude current from "next")
  ranked = buildRankedQueue({ ...input, state });
  const queue = ranked
    .filter((r) => r.familyId !== chosen.familyId)
    .slice(0, queueSize)
    .map(({ def: _d, factors: _f, ...rest }) => rest);

  const totalScanned = Object.values(state.groupScanCounts).reduce(
    (a, b) => a + b,
    0
  );
  const groupSharePct = Object.entries(HUNT_GROUP_QUOTAS)
    .map(([groupId]) => ({
      groupId,
      label: groupLabel(groupId),
      pct:
        totalScanned > 0
          ? Math.round(((state.groupScanCounts[groupId] || 0) / totalScanned) * 100)
          : 0,
    }))
    .sort((a, b) => b.pct - a.pct);

  const nowItem: DiscoveryQueueItem = {
    familyId: chosen.familyId,
    label: chosen.label,
    groupId: chosen.groupId,
    groupLabel: chosen.groupLabel,
    query: chosen.query,
    needScore: chosen.needScore,
    reason: chosen.reason,
  };

  return {
    seed: {
      shelf: chosen.def.shelf,
      query: chosen.query,
      sortBy: chosen.def.sortBy,
      familyId: chosen.familyId,
      label: chosen.label,
      groupId: chosen.groupId,
    },
    state,
    plan: {
      now: nowItem,
      queue,
      groupSharePct,
      updatedAt: new Date().toISOString(),
      lastDecision: decision,
    },
    decision,
  };
}

/** Attribute evaluated products to the active discovery family. */
export function recordDiscoveryYield(
  state: DiscoveryState,
  familyId: string | null,
  count: number
): DiscoveryState {
  if (!familyId || count <= 0) return state;
  const g =
    DISCOVERY_FAMILY_QUERIES.find((f) => f.familyId === familyId)?.groupId ||
    primaryGroupForFamily(familyId)?.id ||
    "maker";
  return {
    ...state,
    familyScanCounts: {
      ...state.familyScanCounts,
      [familyId]: (state.familyScanCounts[familyId] || 0) + count,
    },
    groupScanCounts: {
      ...state.groupScanCounts,
      [g]: (state.groupScanCounts[g] || 0) + count,
    },
  };
}

export async function loadDiscoveryContext(storeId?: string | null): Promise<{
  snapshot: CatalogAssortmentSnapshot;
  targets: Record<string, number>;
  bounds: Record<string, AssortmentBoundsInput>;
  starsByFamily: Record<string, FocusStars>;
  customFamilies: CustomFocusFamily[];
}> {
  const {
    getAssortmentStrategy,
    targetMap,
    boundsMap,
    loadCatalogSnapshotForStore,
  } = await import("@/lib/buyer/assortment-strategy");
  const { getProductFocus, starsMap } = await import(
    "@/lib/buyer/product-focus"
  );

  const [strategy, snapshot, focus] = await Promise.all([
    getAssortmentStrategy(),
    loadCatalogSnapshotForStore(storeId),
    getProductFocus(),
  ]);

  return {
    snapshot,
    targets: targetMap(strategy, snapshot.totalActive),
    bounds: boundsMap(strategy, snapshot.totalActive),
    starsByFamily: starsMap(focus),
    customFamilies: focus.customFamilies,
  };
}

/** Map category mission → discovery group filter. */
export function missionDiscoveryFilter(categoryId: string | null | undefined): {
  allowedShelves?: MerchandiserShelf[] | null;
  allowedGroupIds?: string[] | null;
} {
  if (!categoryId) return {};
  const map: Record<
    string,
    { shelves?: MerchandiserShelf[]; groups?: string[] }
  > = {
    gaming: { groups: ["pc_gaming", "streaming", "data_it"] },
    mobil: { groups: ["mobil"] },
    kontor: { groups: ["kontor", "data_it"] },
    streaming: { groups: ["streaming"] },
    smart_home: { groups: ["smart_home"] },
    hjem: { groups: ["smart_home", "tv_lyd"] },
    elektronikk: { groups: ["tv_lyd", "data_it", "maker"] },
  };
  const m = map[categoryId];
  if (!m) return {};
  return {
    allowedShelves: m.shelves || null,
    allowedGroupIds: m.groups || null,
  };
}
