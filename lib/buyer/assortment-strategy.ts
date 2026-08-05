/**
 * Sortimentstrategi — butikkens behov (separat fra «Lær AI-en»).
 *
 * Dynamiske mål: sharePct × katalogstørrelse (skalerer når butikken vokser).
 * Myk/hard grense: demper / nesten ignorerer overrepresenterte familier.
 * Oppdrag: midlertidig re-vekt uten å skrive preferanseregler.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PRODUCT_FAMILIES,
  familyLabel,
  matchFamily,
} from "@/lib/intelligence/families";
import {
  buildCatalogSnapshot,
  type CatalogAssortmentSnapshot,
} from "@/lib/buyer/assortment-score";

export const ASSORTMENT_STRATEGY_KEY = "buyer_assortment_strategy";

/** Baseline catalog size used when deriving sharePct from legacy fixed targets. */
export const STRATEGY_BASELINE_CATALOG = 420;

export type AssortmentMissionId =
  | "none"
  | "best_gaming"
  | "komplett_like"
  | "home_office";

export type AssortmentTarget = {
  familyId: string;
  label: string;
  /**
   * Ideal share of active catalog (percent).
   * targetCount ≈ max(minCount, round(totalActive * sharePct / 100))
   */
  sharePct: number;
  /** Floor even on tiny catalogs */
  minCount: number;
  /** Soft max as multiple of target (e.g. 1.3 → 45 if target 35) */
  softMaxRatio: number;
  /** Hard max as multiple of target (e.g. 1.7 → 60 if target 35) */
  hardMaxRatio: number;
  /** Optional manual override of computed target count */
  targetOverride: number | null;
  enabled: boolean;
};

export type AssortmentMission = {
  id: AssortmentMissionId;
  label: string;
  /** Remaining products to prioritize under this mission (0 = inactive) */
  remaining: number;
  /** familyId → weight multiplier (1 = neutral, >1 boost, <1 demote) */
  weights: Record<string, number>;
};

export type AssortmentStrategyConfig = {
  updatedAt: string;
  mode: "balanced" | "dynamic";
  targets: AssortmentTarget[];
  mission: AssortmentMission;
};

export type ResolvedFamilyBounds = {
  familyId: string;
  target: number;
  softMax: number;
  hardMax: number;
  sharePct: number;
  missionWeight: number;
};

export type AssortmentFamilyStatus = {
  familyId: string;
  label: string;
  have: number;
  target: number;
  softMax: number;
  hardMax: number;
  sharePct: number;
  enabled: boolean;
  fillRatio: number;
  health: "red" | "yellow" | "green" | "over";
  gap: number;
  missionWeight: number;
};

export type CategoryHealthRow = {
  category: string;
  have: number;
  target: number;
  fillPct: number;
  health: "red" | "yellow" | "green";
};

export type AssortmentDashboard = {
  updatedAt: string;
  totalActive: number;
  storeHealthPct: number;
  families: AssortmentFamilyStatus[];
  categories: CategoryHealthRow[];
  mission: AssortmentMission;
  summary: {
    underfilled: number;
    onTrack: number;
    saturated: number;
    overSoft: number;
  };
};

type TargetSeed = {
  familyId: string;
  label: string;
  /** Legacy fixed target at ~420 products → converted to sharePct */
  seedAt420: number;
  minCount?: number;
  softMaxRatio?: number;
  hardMaxRatio?: number;
};

const SEEDS: TargetSeed[] = [
  { familyId: "gaming_mouse", label: "Gamingmus", seedAt420: 35 },
  { familyId: "vertical_mouse", label: "Vertikal mus", seedAt420: 12 },
  { familyId: "ergonomic_mouse", label: "Ergonomisk mus", seedAt420: 15 },
  { familyId: "fps_mouse", label: "FPS-mus", seedAt420: 12 },
  { familyId: "mmo_mouse", label: "MMO-mus", seedAt420: 10 },
  { familyId: "ultralight_mouse", label: "Ultralett mus", seedAt420: 12 },
  { familyId: "wireless_mouse", label: "Trådløs mus", seedAt420: 18 },
  { familyId: "office_mouse", label: "Kontormus", seedAt420: 20 },
  { familyId: "bluetooth_mouse", label: "Bluetooth-mus", seedAt420: 15 },
  { familyId: "trackball", label: "Trackball", seedAt420: 8 },
  { familyId: "mouse", label: "Mus (generisk)", seedAt420: 15 },
  { familyId: "mechanical_keyboard", label: "Mekanisk tastatur", seedAt420: 40 },
  { familyId: "gaming_keyboard", label: "Gamingtastatur", seedAt420: 40 },
  { familyId: "keyboard_60", label: "60 % tastatur", seedAt420: 10 },
  { familyId: "keyboard_65", label: "65 % tastatur", seedAt420: 12 },
  { familyId: "keyboard_75", label: "75 % tastatur", seedAt420: 12 },
  { familyId: "keyboard_tkl", label: "TKL-tastatur", seedAt420: 15 },
  { familyId: "keyboard_fullsize", label: "Fullsize-tastatur", seedAt420: 15 },
  { familyId: "office_keyboard", label: "Kontortastatur", seedAt420: 20 },
  { familyId: "keyboard", label: "Tastatur (generisk)", seedAt420: 15 },
  { familyId: "headset", label: "Gamingheadset", seedAt420: 40 },
  { familyId: "mouse_pad", label: "Musematter", seedAt420: 25 },
  { familyId: "controller", label: "Kontrollere", seedAt420: 20 },
  { familyId: "led_lighting", label: "RGB / LED", seedAt420: 35 },
  { familyId: "led_strip", label: "LED-strips", seedAt420: 20 },
  { familyId: "webcam", label: "Webkamera", seedAt420: 20 },
  { familyId: "microphone", label: "Mikrofoner", seedAt420: 20 },
  { familyId: "monitor_arm", label: "Monitorarmer", seedAt420: 15 },
  { familyId: "laptop_stand", label: "Laptopstativer", seedAt420: 15 },
  { familyId: "usb_c_hub", label: "USB-huber", seedAt420: 20 },
  { familyId: "docking_station", label: "Dockingstasjoner", seedAt420: 20 },
  { familyId: "powerbank", label: "Powerbanks", seedAt420: 30 },
  { familyId: "charger", label: "Mobilladere", seedAt420: 30 },
  { familyId: "magsafe", label: "MagSafe-tilbehør", seedAt420: 30 },
  { familyId: "bluetooth_speaker", label: "Bluetooth-høyttalere", seedAt420: 25 },
  { familyId: "pc_speaker", label: "PC-høyttalere", seedAt420: 20 },
  { familyId: "ssd", label: "SSD", seedAt420: 25 },
  { familyId: "ram", label: "RAM", seedAt420: 20 },
  { familyId: "cpu_cooler", label: "CPU-kjølere", seedAt420: 15 },
  { familyId: "case_fan", label: "Kabinettvifter", seedAt420: 20 },
  { familyId: "smart_bulb", label: "Smartpærer", seedAt420: 20 },
  { familyId: "security_camera", label: "Overvåkningskamera", seedAt420: 15 },
  { familyId: "smart_plug", label: "Smart plugs", seedAt420: 20 },
  { familyId: "hdmi_cable", label: "HDMI-kabler", seedAt420: 20 },
  { familyId: "displayport_cable", label: "DisplayPort-kabler", seedAt420: 20 },
  { familyId: "usb_c_cable", label: "USB-C-kabler", seedAt420: 30 },
  { familyId: "ethernet_cable", label: "Ethernet-kabler", seedAt420: 15 },
  { familyId: "card_reader", label: "Kortlesere", seedAt420: 15 },
  { familyId: "adapter", label: "Adaptere", seedAt420: 20 },
  { familyId: "precision_tools", label: "Elektriske presisjonsverktøy", seedAt420: 15 },
];

export const ASSORTMENT_MISSIONS: Record<
  Exclude<AssortmentMissionId, "none">,
  { label: string; defaultRemaining: number; weights: Record<string, number> }
> = {
  best_gaming: {
    label: "Bygg den beste gamingbutikken",
    defaultRemaining: 500,
    weights: {
      gaming_mouse: 1.6,
      gaming_keyboard: 1.6,
      mechanical_keyboard: 1.4,
      headset: 1.5,
      mouse_pad: 1.4,
      controller: 1.5,
      led_lighting: 1.3,
      fps_mouse: 1.5,
      mmo_mouse: 1.4,
      ultralight_mouse: 1.5,
    },
  },
  komplett_like: {
    label: "Komplett-lignende elektronikkbutikk",
    defaultRemaining: 800,
    weights: {
      // Broad boost for under-served mains via families
      ssd: 1.4,
      ram: 1.4,
      usb_c_hub: 1.3,
      docking_station: 1.3,
      powerbank: 1.3,
      charger: 1.2,
      bluetooth_speaker: 1.3,
      webcam: 1.3,
      monitor_arm: 1.3,
      smart_bulb: 1.4,
      smart_plug: 1.4,
      security_camera: 1.5,
    },
  },
  home_office: {
    label: "Prioriter hjemmekontor",
    defaultRemaining: 500,
    weights: {
      office_mouse: 1.5,
      office_keyboard: 1.5,
      webcam: 1.7,
      microphone: 1.5,
      laptop_stand: 1.6,
      monitor_arm: 1.6,
      usb_c_hub: 1.5,
      docking_station: 1.6,
      ergonomic_mouse: 1.5,
      vertical_mouse: 1.4,
    },
  },
};

function seedToTarget(s: TargetSeed): AssortmentTarget {
  const sharePct = Math.round((s.seedAt420 / STRATEGY_BASELINE_CATALOG) * 1000) / 10;
  return {
    familyId: s.familyId,
    label: s.label,
    sharePct: Math.max(0.2, Math.min(25, sharePct)),
    minCount: s.minCount ?? Math.max(3, Math.round(s.seedAt420 * 0.25)),
    softMaxRatio: s.softMaxRatio ?? 1.3,
    hardMaxRatio: s.hardMaxRatio ?? 1.7,
    targetOverride: null,
    enabled: true,
  };
}

export const DEFAULT_ASSORTMENT_TARGETS: AssortmentTarget[] =
  SEEDS.map(seedToTarget);

export function idleMission(): AssortmentMission {
  return { id: "none", label: "Ingen aktivt oppdrag", remaining: 0, weights: {} };
}

export function defaultAssortmentStrategy(): AssortmentStrategyConfig {
  return {
    updatedAt: new Date().toISOString(),
    mode: "dynamic",
    targets: DEFAULT_ASSORTMENT_TARGETS.map((t) => ({ ...t })),
    mission: idleMission(),
  };
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTarget(row: unknown, fallback?: AssortmentTarget): AssortmentTarget | null {
  if (!row || typeof row !== "object") return fallback || null;
  const r = row as Record<string, unknown>;
  const familyId = String(r.familyId || fallback?.familyId || "").trim();
  if (!familyId) return null;

  // Legacy: fixed `target` without sharePct → derive share from baseline
  let sharePct = num(r.sharePct, NaN);
  if (!Number.isFinite(sharePct)) {
    const legacyTarget = num(r.target, NaN);
    if (Number.isFinite(legacyTarget)) {
      sharePct = Math.round((legacyTarget / STRATEGY_BASELINE_CATALOG) * 1000) / 10;
    } else {
      sharePct = fallback?.sharePct ?? 2;
    }
  }

  const softMaxRatio = Math.max(1.05, Math.min(3, num(r.softMaxRatio, fallback?.softMaxRatio ?? 1.3)));
  const hardMaxRatio = Math.max(
    softMaxRatio + 0.1,
    Math.min(4, num(r.hardMaxRatio, fallback?.hardMaxRatio ?? 1.7))
  );

  let targetOverride: number | null = null;
  if (r.targetOverride != null && Number.isFinite(Number(r.targetOverride))) {
    targetOverride = Math.max(1, Math.min(500, Math.round(Number(r.targetOverride))));
  }

  return {
    familyId,
    label: String(r.label || fallback?.label || familyLabel(familyId) || familyId),
    sharePct: Math.max(0.1, Math.min(30, sharePct)),
    minCount: Math.max(1, Math.min(100, Math.round(num(r.minCount, fallback?.minCount ?? 3)))),
    softMaxRatio,
    hardMaxRatio,
    targetOverride,
    enabled: r.enabled !== false,
  };
}

function normalizeMission(raw: unknown): AssortmentMission {
  if (!raw || typeof raw !== "object") return idleMission();
  const o = raw as Record<string, unknown>;
  const id = (o.id as AssortmentMissionId) || "none";
  if (id === "none") return idleMission();
  const preset = ASSORTMENT_MISSIONS[id as Exclude<AssortmentMissionId, "none">];
  if (!preset) return idleMission();
  const remaining = Math.max(0, Math.round(num(o.remaining, 0)));
  if (remaining <= 0) return idleMission();
  return {
    id,
    label: String(o.label || preset.label),
    remaining,
    weights: {
      ...preset.weights,
      ...(o.weights && typeof o.weights === "object"
        ? (o.weights as Record<string, number>)
        : {}),
    },
  };
}

function normalizeConfig(raw: unknown): AssortmentStrategyConfig {
  const defaults = defaultAssortmentStrategy();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const o = raw as Record<string, unknown>;
  const byId = new Map<string, AssortmentTarget>();
  for (const t of defaults.targets) byId.set(t.familyId, { ...t });
  const targetsIn = Array.isArray(o.targets) ? o.targets : [];
  for (const row of targetsIn) {
    const n = normalizeTarget(row, byId.get(String((row as { familyId?: string })?.familyId || "")));
    if (n) byId.set(n.familyId, n);
  }
  return {
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : defaults.updatedAt,
    mode: o.mode === "balanced" ? "balanced" : "dynamic",
    targets: [...byId.values()],
    mission: normalizeMission(o.mission),
  };
}

export async function getAssortmentStrategy(): Promise<AssortmentStrategyConfig> {
  const row = await prisma.setting.findUnique({
    where: { key: ASSORTMENT_STRATEGY_KEY },
  });
  return normalizeConfig(row?.value);
}

export async function saveAssortmentStrategy(
  partial: Omit<Partial<AssortmentStrategyConfig>, "targets" | "mission"> & {
    targets?: Array<
      Partial<AssortmentTarget> & {
        familyId: string;
        /** Legacy fixed count — converted to sharePct when sharePct omitted */
        target?: number;
      }
    >;
    mission?: AssortmentMission;
    missionId?: AssortmentMissionId;
    missionRemaining?: number;
  }
): Promise<AssortmentStrategyConfig> {
  const current = await getAssortmentStrategy();
  let mission = current.mission;
  if (partial.mission) {
    mission = normalizeMission(partial.mission);
  } else if (partial.missionId != null) {
    if (partial.missionId === "none") {
      mission = idleMission();
    } else if (
      partial.missionId === current.mission.id &&
      current.mission.remaining > 0 &&
      partial.missionRemaining == null
    ) {
      // Keep remaining progress when re-saving same mission
      mission = current.mission;
    } else {
      const preset = ASSORTMENT_MISSIONS[partial.missionId];
      mission = {
        id: partial.missionId,
        label: preset.label,
        remaining:
          partial.missionRemaining != null
            ? Math.max(0, Math.round(partial.missionRemaining))
            : preset.defaultRemaining,
        weights: { ...preset.weights },
      };
    }
  }

  const merged = normalizeConfig({
    ...current,
    ...partial,
    targets: partial.targets ?? current.targets,
    mission,
    updatedAt: new Date().toISOString(),
  });

  await prisma.setting.upsert({
    where: { key: ASSORTMENT_STRATEGY_KEY },
    create: {
      key: ASSORTMENT_STRATEGY_KEY,
      value: merged as unknown as Prisma.InputJsonValue,
    },
    update: {
      value: merged as unknown as Prisma.InputJsonValue,
    },
  });
  return merged;
}

/** Compute ideal / soft / hard counts for a family given catalog size. */
export function resolveFamilyBounds(
  t: AssortmentTarget,
  totalActive: number,
  mission?: AssortmentMission | null
): ResolvedFamilyBounds {
  const catalog = Math.max(1, totalActive);
  let target =
    t.targetOverride != null
      ? t.targetOverride
      : Math.max(t.minCount, Math.round((catalog * t.sharePct) / 100));
  target = Math.max(1, target);
  const softMax = Math.max(target + 1, Math.round(target * t.softMaxRatio));
  const hardMax = Math.max(softMax + 1, Math.round(target * t.hardMaxRatio));
  const missionWeight =
    mission && mission.id !== "none" && mission.remaining > 0
      ? mission.weights[t.familyId] ?? 1
      : 1;
  return {
    familyId: t.familyId,
    target,
    softMax,
    hardMax,
    sharePct: t.sharePct,
    missionWeight,
  };
}

/** Map used by ranking: familyId → target count (dynamic). */
export function targetMap(
  strategy: AssortmentStrategyConfig,
  totalActive: number
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of strategy.targets) {
    if (!t.enabled) continue;
    out[t.familyId] = resolveFamilyBounds(t, totalActive, strategy.mission).target;
  }
  return out;
}

/** Rich bounds map for scoring with soft/hard + mission weight. */
export function boundsMap(
  strategy: AssortmentStrategyConfig,
  totalActive: number
): Record<string, ResolvedFamilyBounds> {
  const out: Record<string, ResolvedFamilyBounds> = {};
  for (const t of strategy.targets) {
    if (!t.enabled) continue;
    out[t.familyId] = resolveFamilyBounds(t, totalActive, strategy.mission);
  }
  return out;
}

export function familyHealth(
  have: number,
  target: number,
  softMax?: number
): "red" | "yellow" | "green" | "over" {
  if (target <= 0) return "green";
  if (softMax != null && have >= softMax) return "over";
  const r = have / target;
  if (r >= 0.9) return "green";
  if (r >= 0.45) return "yellow";
  return "red";
}

export async function loadCatalogSnapshotForStore(
  storeId?: string | null
): Promise<CatalogAssortmentSnapshot> {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(storeId ? { storeId } : {}),
    },
    select: { name: true, category: true, isActive: true },
    take: 8000,
  });
  return buildCatalogSnapshot(products);
}

function buildCategoryHealth(
  families: AssortmentFamilyStatus[],
  strategy: AssortmentStrategyConfig
): CategoryHealthRow[] {
  const byCat = new Map<string, { have: number; target: number }>();
  for (const f of families) {
    if (!f.enabled) continue;
    const meta = PRODUCT_FAMILIES.find((p) => p.id === f.familyId);
    const cat = meta?.categoryHint || "Ukategorisert";
    const cur = byCat.get(cat) || { have: 0, target: 0 };
    cur.have += f.have;
    cur.target += f.target;
    byCat.set(cat, cur);
  }
  // Mission category hints: home_office / gaming get slight display note via fill only
  void strategy;
  return [...byCat.entries()]
    .map(([category, v]) => {
      const fillPct =
        v.target > 0 ? Math.round(Math.min(100, (v.have / v.target) * 100)) : 100;
      const health: CategoryHealthRow["health"] =
        fillPct >= 85 ? "green" : fillPct >= 50 ? "yellow" : "red";
      return { category, have: v.have, target: v.target, fillPct, health };
    })
    .sort((a, b) => a.fillPct - b.fillPct);
}

export async function getAssortmentDashboard(opts?: {
  storeId?: string | null;
}): Promise<AssortmentDashboard> {
  const [strategy, snapshot] = await Promise.all([
    getAssortmentStrategy(),
    loadCatalogSnapshotForStore(opts?.storeId),
  ]);

  const families: AssortmentFamilyStatus[] = strategy.targets
    .map((t) => {
      const bounds = resolveFamilyBounds(t, snapshot.totalActive, strategy.mission);
      const have = snapshot.byFamily[t.familyId] || 0;
      return {
        familyId: t.familyId,
        label: t.label || familyLabel(t.familyId),
        have,
        target: bounds.target,
        softMax: bounds.softMax,
        hardMax: bounds.hardMax,
        sharePct: t.sharePct,
        enabled: t.enabled,
        fillRatio: bounds.target > 0 ? have / bounds.target : 1,
        health: t.enabled
          ? familyHealth(have, bounds.target, bounds.softMax)
          : ("green" as const),
        gap: Math.max(0, bounds.target - have),
        missionWeight: bounds.missionWeight,
      };
    })
    .sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return b.gap - a.gap || a.label.localeCompare(b.label, "no");
    });

  const active = families.filter((f) => f.enabled);
  const categories = buildCategoryHealth(families, strategy);
  const storeHealthPct =
    categories.length === 0
      ? 100
      : Math.round(
          categories.reduce((s, c) => s + c.fillPct, 0) / categories.length
        );

  return {
    updatedAt: strategy.updatedAt,
    totalActive: snapshot.totalActive,
    storeHealthPct,
    families,
    categories,
    mission: strategy.mission,
    summary: {
      underfilled: active.filter((f) => f.health === "red").length,
      onTrack: active.filter((f) => f.health === "yellow").length,
      saturated: active.filter((f) => f.health === "green").length,
      overSoft: active.filter((f) => f.health === "over").length,
    },
  };
}

export function knownFamilyIds(): string[] {
  return PRODUCT_FAMILIES.map((f) => f.id);
}

export function resolveFamilyForTitle(
  title: string,
  categoryHint?: string | null
): string | null {
  return matchFamily(title, categoryHint);
}

/** Decrement mission remaining after a successful publish batch (best-effort). */
export async function tickAssortmentMission(publishedCount: number): Promise<void> {
  if (publishedCount <= 0) return;
  const strategy = await getAssortmentStrategy();
  if (strategy.mission.id === "none" || strategy.mission.remaining <= 0) return;
  const remaining = Math.max(0, strategy.mission.remaining - publishedCount);
  await saveAssortmentStrategy({
    mission:
      remaining <= 0
        ? idleMission()
        : { ...strategy.mission, remaining },
  });
}
