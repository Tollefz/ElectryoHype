/**
 * Produktfokus — pure scoring / catalog (client-safe).
 * Persistence lives in product-focus.ts (server-only).
 */

import {
  PRODUCT_FAMILIES,
  familyLabel,
  matchFamily,
} from "@/lib/intelligence/families";

export type FocusStars = 0 | 1 | 2 | 3 | 4 | 5;
export type FocusTier = "core" | "supplementary";

export type CustomFocusFamily = {
  id: string;
  label: string;
  groupId: string;
  keywords: string[];
  tier?: FocusTier;
};

export type FocusEntry = {
  familyId: string;
  stars: FocusStars;
};

export type FocusCatalogItem = {
  familyId: string;
  label: string;
  groupId: string;
  custom: boolean;
  tier: FocusTier;
};

export type FocusGroup = {
  id: string;
  label: string;
  shortLabel: string;
  emoji: string;
  items: FocusCatalogItem[];
};

export type FocusSuggestion = {
  id: string;
  kind: "add_focus" | "increase_focus" | "reduce_focus" | "shift_focus";
  familyId: string | null;
  groupId: string | null;
  label: string;
  message: string;
  publishCount?: number;
  ignoreCount?: number;
  proposedStars?: FocusStars;
};

export type WhyFoundRow = {
  id: string;
  label: string;
  stars: FocusStars;
};

type FamilyDef = { id: string; label: string };

export const FOCUS_GROUP_DEFS: Array<{
  id: string;
  label: string;
  shortLabel: string;
  emoji: string;
  core: FamilyDef[];
  supplementary: FamilyDef[];
}> = [
  {
    id: "pc_gaming",
    label: "PC & Gaming",
    shortLabel: "Gaming",
    emoji: "🎮",
    core: [
      { id: "gaming_mouse", label: "Gamingmus" },
      { id: "gaming_keyboard", label: "Gamingtastatur" },
      { id: "mechanical_keyboard", label: "Mekanisk tastatur" },
      { id: "headset", label: "Gamingheadset" },
      { id: "microphone", label: "Mikrofon" },
      { id: "webcam", label: "Webkamera" },
      { id: "mouse_pad", label: "Musematte" },
      { id: "ssd", label: "SSD" },
      { id: "ram", label: "RAM" },
      { id: "usb_c_hub", label: "USB Hub" },
      { id: "docking_station", label: "Docking" },
      { id: "led_lighting", label: "RGB" },
    ],
    supplementary: [
      { id: "cable_management", label: "Kabelorganisering" },
      { id: "headphone_stand", label: "Headsetstativ" },
      { id: "capture_card", label: "Capture card" },
      { id: "controller", label: "Kontrollere" },
      { id: "flight_sim", label: "Flight simulator" },
      { id: "sim_racing", label: "Sim Racing" },
      { id: "mini_pc", label: "Mini-PC" },
      { id: "case_fan", label: "Kabinettvifter" },
      { id: "cpu_cooler", label: "CPU-kjølere" },
      { id: "monitor_arm", label: "Monitorarm" },
      { id: "gaming_chair", label: "Gamingstoler" },
      { id: "stream_deck", label: "Stream Deck" },
      { id: "retro_gaming", label: "Retro gaming" },
      { id: "ai_pc", label: "AI-PC" },
    ],
  },
  {
    id: "mobil",
    label: "Mobil",
    shortLabel: "Mobil",
    emoji: "📱",
    core: [
      { id: "powerbank", label: "Powerbanks" },
      { id: "magsafe", label: "MagSafe" },
      { id: "charger", label: "Hurtigladere" },
      { id: "usb_c_cable", label: "USB-C-kabler" },
      { id: "qi_charger", label: "Qi-ladere" },
    ],
    supplementary: [
      { id: "lightning_cable", label: "Lightning-kabler" },
      { id: "car_charger", label: "Billadere" },
      { id: "phone_mount", label: "Telefonholdere" },
      { id: "adapter", label: "Adaptere" },
      { id: "phone_stand", label: "Mobilstativ" },
    ],
  },
  {
    id: "streaming",
    label: "Streaming",
    shortLabel: "Streaming",
    emoji: "📹",
    core: [
      { id: "microphone", label: "Mikrofon" },
      { id: "webcam", label: "Webkamera" },
      { id: "boom_arm", label: "Boom arm" },
      { id: "ring_light", label: "Ring light" },
      { id: "capture_card", label: "Capture card" },
    ],
    supplementary: [
      { id: "green_screen", label: "Green screen" },
      { id: "video_light", label: "Videolys" },
      { id: "camera_tripod", label: "Kamerastativ" },
      { id: "audio_interface", label: "Lydkort" },
      { id: "stream_deck", label: "Stream Deck" },
    ],
  },
  {
    id: "smart_home",
    label: "Smart Home",
    shortLabel: "Smart Home",
    emoji: "🏠",
    core: [
      { id: "smart_plug", label: "Smart Plug" },
      { id: "smart_bulb", label: "Smart Lights" },
      { id: "security_camera", label: "Overvåkningskamera" },
      { id: "smart_sensor", label: "Smart Sensor" },
    ],
    supplementary: [
      { id: "doorbell", label: "Dørklokker" },
      { id: "smart_switch", label: "Smarte brytere" },
      { id: "air_sensor", label: "Luftsensor" },
      { id: "temp_sensor", label: "Temperaturmåler" },
      { id: "robot_vacuum", label: "Robotstøvsuger" },
    ],
  },
  {
    id: "kontor",
    label: "Kontor",
    shortLabel: "Kontor",
    emoji: "🖥",
    core: [
      { id: "ergonomic_mouse", label: "Ergonomisk mus" },
      { id: "ergonomic_keyboard", label: "Ergonomisk tastatur" },
      { id: "laptop_stand", label: "Laptopstativ" },
      { id: "usb_c_hub", label: "USB Dock" },
      { id: "monitor_arm", label: "Skjermarm" },
      { id: "webcam", label: "Webkamera" },
    ],
    supplementary: [
      { id: "document_holder", label: "Dokumentholder" },
      { id: "cable_management", label: "Kabelorganisering" },
      { id: "headphone_stand", label: "Hodetelefonstativ" },
      { id: "office_keyboard", label: "Kontortastatur" },
      { id: "office_mouse", label: "Kontormus" },
    ],
  },
  {
    id: "tv_lyd",
    label: "TV & Lyd",
    shortLabel: "TV & Lyd",
    emoji: "🔊",
    core: [
      { id: "bluetooth_speaker", label: "Bluetooth-høyttaler" },
      { id: "pc_speaker", label: "PC-høyttaler" },
      { id: "hdmi_cable", label: "HDMI-kabel" },
      { id: "soundbar", label: "Soundbar" },
    ],
    supplementary: [
      { id: "displayport_cable", label: "DisplayPort" },
      { id: "optical_cable", label: "Optisk kabel" },
      { id: "dac", label: "DAC" },
      { id: "headphone_amp", label: "Hodetelefonforsterker" },
    ],
  },
  {
    id: "foto",
    label: "Foto & Video",
    shortLabel: "Foto",
    emoji: "📷",
    core: [
      { id: "camera_tripod", label: "Kamerastativ" },
      { id: "sd_card", label: "SD-kort" },
      { id: "card_reader", label: "Kortleser" },
    ],
    supplementary: [
      { id: "camera_light", label: "Kameralys" },
      { id: "camera_bag", label: "Kameraryggsekk" },
      { id: "battery_charger", label: "Batterilader" },
      { id: "lens_accessory", label: "Objektivtilbehør" },
    ],
  },
  {
    id: "bil",
    label: "Bil",
    shortLabel: "Bil",
    emoji: "🚗",
    core: [
      { id: "dashcam", label: "Dashcam" },
      { id: "car_charger", label: "Billader" },
      { id: "phone_mount", label: "Telefonholder" },
    ],
    supplementary: [
      { id: "car_bt_adapter", label: "Bluetooth-adapter" },
      { id: "air_compressor", label: "Luftkompressor" },
      { id: "obd_reader", label: "OBD-leser" },
      { id: "battery_charger", label: "Batterilader" },
    ],
  },
  {
    id: "maker",
    label: "Maker & lagring",
    shortLabel: "Maker",
    emoji: "🛠",
    core: [
      { id: "nas", label: "NAS" },
      { id: "precision_tools", label: "Presisjonsverktøy" },
    ],
    supplementary: [
      { id: "server", label: "Server" },
      { id: "printer_3d", label: "3D-printer" },
      { id: "fpv_drone", label: "FPV-drone" },
      { id: "mini_pc", label: "Mini-PC" },
    ],
  },
];

/** Sensible defaults — store focus without empty state. */
export const DEFAULT_FOCUS_STARS: Record<string, FocusStars> = {
  gaming_mouse: 5,
  gaming_keyboard: 5,
  mechanical_keyboard: 4,
  headset: 5,
  mouse_pad: 4,
  microphone: 5,
  webcam: 4,
  led_lighting: 4,
  ssd: 4,
  ram: 4,
  docking_station: 4,
  usb_c_hub: 4,
  monitor_arm: 3,
  capture_card: 3,
  controller: 3,
  powerbank: 4,
  magsafe: 4,
  charger: 4,
  usb_c_cable: 3,
  qi_charger: 3,
  boom_arm: 4,
  ring_light: 3,
  smart_plug: 3,
  smart_bulb: 3,
  security_camera: 3,
  ergonomic_mouse: 4,
  ergonomic_keyboard: 4,
  laptop_stand: 4,
  cable_management: 2,
  bluetooth_speaker: 3,
  hdmi_cable: 3,
  nas: 2,
  mini_pc: 2,
  dashcam: 1,
};

export function clampFocusStars(n: unknown): FocusStars {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v >= 5) return 5;
  return v as FocusStars;
}

export function slugifyFocusLabel(label: string): string {
  return (
    "custom_" +
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40)
  );
}

export function familyTier(
  familyId: string,
  customs: CustomFocusFamily[] = []
): FocusTier {
  const custom = customs.find((c) => c.id === familyId);
  if (custom?.tier) return custom.tier;
  for (const g of FOCUS_GROUP_DEFS) {
    if (g.core.some((f) => f.id === familyId)) return "core";
    if (g.supplementary.some((f) => f.id === familyId)) return "supplementary";
  }
  return "supplementary";
}

export function primaryGroupForFamily(
  familyId: string,
  customs: CustomFocusFamily[] = []
): (typeof FOCUS_GROUP_DEFS)[number] | null {
  const custom = customs.find((c) => c.id === familyId);
  if (custom) {
    return (
      FOCUS_GROUP_DEFS.find((g) => g.id === custom.groupId) || {
        id: custom.groupId,
        label: custom.groupId,
        shortLabel: custom.groupId,
        emoji: "📦",
        core: [],
        supplementary: [],
      }
    );
  }
  for (const g of FOCUS_GROUP_DEFS) {
    if (
      g.core.some((f) => f.id === familyId) ||
      g.supplementary.some((f) => f.id === familyId)
    ) {
      return g;
    }
  }
  return null;
}

/** Bonus (−0..+14). Supplementary never dominates. Gate on shop match. */
export function scoreProductFocus(input: {
  familyId: string | null;
  stars: FocusStars;
  shopMatchPct?: number | null;
  label?: string;
  tier?: FocusTier;
}): { score: number; why: string[]; stars: FocusStars; pastGate: boolean } {
  const why: string[] = [];
  const stars = input.stars;
  const match = input.shopMatchPct ?? 0;
  const label =
    input.label ||
    (input.familyId ? familyLabel(input.familyId) : "ukjent");
  const tier = input.tier || "core";

  if (match < 65) {
    if (stars >= 4 && match >= 50) {
      why.push(
        `Produktfokus ${"★".repeat(stars)} ${label} — men butikkmatch for lav`
      );
    }
    return { score: 0, why, stars, pastGate: false };
  }

  if (!input.familyId || stars <= 0) {
    return { score: 0, why, stars: 0, pastGate: true };
  }

  const table: Record<FocusStars, number> = {
    0: 0,
    1: 2,
    2: 5,
    3: 8,
    4: 11,
    5: 14,
  };
  let score = table[stars];
  if (tier === "supplementary") {
    score = Math.round(score * 0.55);
    why.push(
      `Produktfokus (supplerende): ${label} ${"★".repeat(stars)}${"☆".repeat(5 - stars)}`
    );
  } else {
    why.push(
      `Produktfokus (kjerne): ${label} ${"★".repeat(stars)}${"☆".repeat(5 - stars)}`
    );
  }
  return { score, why, stars, pastGate: true };
}

export function compileCustomPatterns(
  customs: CustomFocusFamily[]
): Array<{ id: string; label: string; patterns: RegExp[] }> {
  return customs.map((c) => ({
    id: c.id,
    label: c.label,
    patterns: (c.keywords.length ? c.keywords : [c.label]).map((k) => {
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(esc, "i");
    }),
  }));
}

export function matchFamilyWithCustoms(
  title: string,
  category: string | null | undefined,
  customs: CustomFocusFamily[]
): string | null {
  const text = `${title} ${category || ""}`;
  for (const c of compileCustomPatterns(customs)) {
    if (c.patterns.some((p) => p.test(text))) return c.id;
  }
  return matchFamily(title, category);
}

export function buildFocusGroups(
  customFamilies: CustomFocusFamily[] = []
): FocusGroup[] {
  const groups: FocusGroup[] = FOCUS_GROUP_DEFS.map((g) => {
    const seen = new Set<string>();
    const items: FocusCatalogItem[] = [];
    for (const f of g.core) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      items.push({
        familyId: f.id,
        label: f.label,
        groupId: g.id,
        custom: false,
        tier: "core",
      });
    }
    for (const f of g.supplementary) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      items.push({
        familyId: f.id,
        label: f.label,
        groupId: g.id,
        custom: false,
        tier: "supplementary",
      });
    }
    return {
      id: g.id,
      label: g.label,
      shortLabel: g.shortLabel,
      emoji: g.emoji,
      items,
    };
  });

  for (const c of customFamilies) {
    let g = groups.find((x) => x.id === c.groupId);
    if (!g) {
      g = {
        id: c.groupId,
        label: c.groupId,
        shortLabel: c.groupId,
        emoji: "📦",
        items: [],
      };
      groups.push(g);
    }
    if (!g.items.some((i) => i.familyId === c.id)) {
      g.items.push({
        familyId: c.id,
        label: c.label,
        groupId: c.groupId,
        custom: true,
        tier: c.tier || "supplementary",
      });
    }
  }
  return groups;
}

/** Group priority stars = avg of active core families (fallback: all active). */
export function computeGroupStars(
  group: FocusGroup,
  starsByFamily: Record<string, number>
): FocusStars {
  const coreActive = group.items.filter(
    (i) => i.tier === "core" && (starsByFamily[i.familyId] ?? 0) > 0
  );
  const pool =
    coreActive.length > 0
      ? coreActive
      : group.items.filter((i) => (starsByFamily[i.familyId] ?? 0) > 0);
  if (pool.length === 0) return 0;
  const avg =
    pool.reduce((s, i) => s + (starsByFamily[i.familyId] || 0), 0) /
    pool.length;
  return clampFocusStars(Math.round(avg));
}

export function focusGroupBadges(
  familyId: string | null,
  starsByFamily: Record<string, FocusStars | number>,
  customFamilies: CustomFocusFamily[] = []
): Array<{ group: string; stars: FocusStars }> {
  if (!familyId) return [];
  const s = clampFocusStars(starsByFamily[familyId] ?? 0);
  if (s <= 0) return [];
  const groups = buildFocusGroups(customFamilies);
  const hits: Array<{ group: string; stars: FocusStars }> = [];
  for (const g of groups) {
    if (g.items.some((i) => i.familyId === familyId)) {
      hits.push({ group: g.shortLabel || g.label, stars: s });
    }
  }
  return hits.slice(0, 2);
}

/** Map 0–100ish metrics → 1–5 stars for «Hvorfor fant AI dette?» */
export function metricToStars(value: number, max = 100): FocusStars {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const r = Math.max(0, Math.min(1, value / max));
  if (r >= 0.9) return 5;
  if (r >= 0.75) return 4;
  if (r >= 0.55) return 3;
  if (r >= 0.35) return 2;
  return 1;
}

export function buildWhyFoundStars(input: {
  shopMatchPct: number;
  assortmentScore: number | null;
  productFocusStars: number | null;
  marginPct: number | null;
  deliveryHint: string | null;
  qualityScore: number | null;
  overallScore: number | null;
  competitionHint?: number | null;
  assortmentHave?: number | null;
  assortmentTarget?: number | null;
  groupIdentityPct?: number | null;
}): WhyFoundRow[] {
  return buildStoreBuilderWhyFound(input);
}

/** Preferred «Hvorfor fant AI dette?» — store-building narrative first. */
export function buildStoreBuilderWhyFound(input: {
  shopMatchPct: number;
  assortmentScore: number | null;
  productFocusStars: number | null;
  marginPct: number | null;
  deliveryHint: string | null;
  qualityScore: number | null;
  overallScore: number | null;
  competitionHint?: number | null;
  assortmentHave?: number | null;
  assortmentTarget?: number | null;
  groupIdentityPct?: number | null;
}): WhyFoundRow[] {
  const gapRatio =
    input.assortmentTarget != null &&
    input.assortmentTarget > 0 &&
    input.assortmentHave != null
      ? Math.max(0, 1 - input.assortmentHave / input.assortmentTarget)
      : input.assortmentScore != null && input.assortmentScore > 0
        ? Math.min(1, input.assortmentScore / 28)
        : 0.35;

  const deliveryStars: FocusStars = !input.deliveryHint
    ? 2
    : /1[-\s]?3|2[-\s]?4|express|rask/i.test(input.deliveryHint)
      ? 5
      : /4[-\s]?7|5[-\s]?10|uke/i.test(input.deliveryHint)
        ? 3
        : 4;

  return [
    {
      id: "family_gap",
      label: "Produktfamilie mangler",
      stars: metricToStars(gapRatio * 100, 100),
    },
    {
      id: "identity",
      label: "Butikkidentitet",
      stars: metricToStars(
        input.groupIdentityPct ??
          (input.productFocusStars != null
            ? input.productFocusStars * 18
            : 40),
        100
      ),
    },
    {
      id: "assortment",
      label: "Sortiment",
      stars: metricToStars(
        50 + Math.max(-40, Math.min(40, input.assortmentScore ?? 0)),
        100
      ),
    },
    {
      id: "match",
      label: "Butikkmatch",
      stars: metricToStars(input.shopMatchPct, 100),
    },
    {
      id: "margin",
      label: "Margin",
      stars:
        input.marginPct == null
          ? 2
          : metricToStars(Math.min(100, input.marginPct * 1.4), 100),
    },
    {
      id: "delivery",
      label: "Levering",
      stars: deliveryStars,
    },
    {
      id: "competition",
      label: "Konkurranse",
      stars:
        input.competitionHint != null
          ? metricToStars(input.competitionHint, 100)
          : metricToStars(
              100 - Math.min(90, (input.overallScore ?? 50) * 0.4),
              100
            ),
    },
    {
      id: "quality",
      label: "Produktkvalitet",
      stars: metricToStars(
        input.qualityScore ?? input.overallScore ?? 50,
        100
      ),
    },
  ];
}

export function knownFocusFamilyIds(): string[] {
  const ids = new Set<string>();
  for (const g of FOCUS_GROUP_DEFS) {
    for (const f of g.core) ids.add(f.id);
    for (const f of g.supplementary) ids.add(f.id);
  }
  for (const f of PRODUCT_FAMILIES) ids.add(f.id);
  return [...ids];
}

export function starsToGlyphs(stars: number): string {
  const s = clampFocusStars(stars);
  return `${"★".repeat(s)}${"☆".repeat(5 - s)}`;
}

export function allFamiliesInGroup(groupId: string): string[] {
  const g = FOCUS_GROUP_DEFS.find((x) => x.id === groupId);
  if (!g) return [];
  return [...g.core, ...g.supplementary].map((f) => f.id);
}

/**
 * Produktjakt-strategi — styrer kun hvordan AI velger neste produkt under jakten.
 * Ligger under Produktfokus (ikke Lær AI-en / Sortimentstrategi).
 */
export const DEFAULT_HUNT_STRATEGY = `Jeg vil at AI skal bygge et bredt og balansert sortiment.

Ikke anbefal mange produkter av samme familie etter hverandre selv om de scorer høyest.

Når AI allerede har funnet mange gode produkter innen én familie (f.eks. gamingmus), skal fokus gradvis flyttes mot andre produktfamilier som fortsatt mangler.

Prioriter variasjon mellom:

• gamingmus
• gamingtastatur
• headset
• mikrofoner
• webkamera
• RGB
• docking
• USB-huber
• SSD
• RAM
• skjermer
• høyttalere
• nettverksutstyr
• kabler
• ladere
• smart home
• streaming-utstyr

AI skal først spørre:

"Hvilken produktfamilie trenger butikken mest akkurat nå?"

Deretter:

"Hva er det beste produktet i den familien?"

Ikke:

"Hva er det beste produktet totalt?"

Dersom AI allerede har funnet mange kandidater fra én familie skal den familien få gradvis lavere prioritet under resten av jakten.

Eksempel:

10 gode gamingmus → liten reduksjon
20 → middels reduksjon
40 → stor reduksjon
80+ → svært stor reduksjon

Reduksjonen gjelder bare under den aktive jakten.
Ved neste jakt starter alle familier likt igjen.

Produktfokus skal aldri kunne gjøre et dårlig produkt godt.
Butikkmatch, produktkvalitet, margin og levering skal alltid være viktigere.

Målet er ikke å finne 500 gamingmus.
Målet er å finne de 10–30 beste gamingmusene, de beste tastaturene, de beste headsettene, de beste SSD-ene osv., slik at butikken får et komplett og variert sortiment.`;
