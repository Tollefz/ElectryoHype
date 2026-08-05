/**
 * Store DNA — observed store identity from the live catalog.
 *
 * Product Focus = what we want. Store DNA = what the store has become.
 * Heuristic only (no LLM). Small signal — never dominates.
 *
 * See STORE_DNA.md
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { matchFamily, familyLabel } from "@/lib/intelligence/families";

export const STORE_DNA_SETTING_KEY = "buyer_store_dna";
/** Hard cap — DNA may only nudge Butikkscore slightly. */
export const DNA_NUDGE_MAX = 2;
const STALE_MS = 30 * 60_000;
const HISTORY_MAX = 12;

export type StoreDnaTraitId =
  | "gaming"
  | "premium"
  | "kontor"
  | "nordic"
  | "apple"
  | "minimalist"
  | "smart_home"
  | "rgb"
  | "high_end"
  | "budget"
  | "diy"
  | "streaming"
  | "mobil"
  | "maker";

export type StoreDnaTrait = {
  id: StoreDnaTraitId;
  label: string;
  /** 0–100 intensity in active catalog */
  pct: number;
  productCount: number;
  why: string[];
};

export type StoreDnaProductSignal = {
  productId: string;
  title: string;
  traitIds: StoreDnaTraitId[];
  alignment: number;
  why: string;
};

export type StoreDnaHistoryPoint = {
  at: string;
  traits: Array<{ id: StoreDnaTraitId; pct: number }>;
};

export type StoreDnaChange = {
  id: StoreDnaTraitId;
  label: string;
  from: number;
  to: number;
  delta: number;
};

export type StoreDnaSnapshot = {
  version: 1;
  rebuiltAt: string;
  productCount: number;
  traits: StoreDnaTrait[];
  strengthens: StoreDnaProductSignal[];
  weakens: StoreDnaProductSignal[];
  history: StoreDnaHistoryPoint[];
  changeWeek: StoreDnaChange[];
  changeMonth: StoreDnaChange[];
};

export type StoreDnaNudge = {
  nudge: number;
  dnaScore: number;
  why: string[];
  matchedTraits: Array<{ id: StoreDnaTraitId; label: string; pct: number }>;
};

type TraitDef = {
  id: StoreDnaTraitId;
  label: string;
  test: (ctx: ProductCtx) => boolean;
};

type ProductCtx = {
  id: string;
  title: string;
  text: string;
  category: string;
  subcategory: string;
  tags: string;
  price: number | null;
  marginPct: number | null;
  familyId: string | null;
  familyLabel: string | null;
};

const TRAIT_DEFS: TraitDef[] = [
  {
    id: "gaming",
    label: "Gaming",
    test: (c) =>
      /gaming|gamer|spill|esport|mechanical\s*keyboard|fps|mmo/i.test(c.text) ||
      /gaming/i.test(c.category) ||
      (c.familyId != null &&
        /mouse|keyboard|headset|mousepad|controller|chair/.test(c.familyId) &&
        /gaming/i.test(c.familyLabel || c.category)),
  },
  {
    id: "rgb",
    label: "RGB",
    test: (c) =>
      /\brgb\b|led\s*(strip|light|lighting)|neon|ambilight/i.test(c.text) ||
      c.familyId === "led_lighting",
  },
  {
    id: "premium",
    label: "Premium",
    test: (c) =>
      (c.price != null && c.price >= 799) ||
      /premium|flagship|pro\b|studio|audiophile|titanium|carbon\s*fiber/i.test(
        c.text
      ),
  },
  {
    id: "high_end",
    label: "High-end",
    test: (c) =>
      (c.price != null && c.price >= 1499) ||
      /high[\s-]?end|flagship|ultrawide|4k\b|oled|thunderbolt/i.test(c.text),
  },
  {
    id: "budget",
    label: "Lavpris",
    test: (c) =>
      (c.price != null && c.price > 0 && c.price < 199) ||
      /budget|billig|value\b|entry[\s-]?level|basic/i.test(c.text),
  },
  {
    id: "kontor",
    label: "Kontor",
    test: (c) =>
      /kontor|office|ergonomic|laptop\s*stand|monitor\s*arm|docking|webcam/i.test(
        c.text
      ) ||
      /data\s*&\s*it|kontor/i.test(c.category) ||
      (c.familyId != null &&
        /office_|ergonomic_|laptop_stand|monitor_arm|docking|usb_c_hub/.test(
          c.familyId
        )),
  },
  {
    id: "mobil",
    label: "Mobil",
    test: (c) =>
      /mobil|phone|magsafe|power\s*bank|earbud|airpod|phone\s*case|charger/i.test(
        c.text
      ) ||
      /mobil/i.test(c.category) ||
      (c.familyId != null &&
        /phone|magsafe|powerbank|charger|earbud|usb_c_cable|lightning/.test(
          c.familyId
        )),
  },
  {
    id: "apple",
    label: "Apple-kompatibelt",
    test: (c) =>
      /iphone|ipad|macbook|airpods|magsafe|lightning|apple\b|watch\s*ultra/i.test(
        c.text
      ),
  },
  {
    id: "nordic",
    label: "Nordiske merker",
    test: (c) =>
      /nordic|scandi|svensk|norsk|dansk|finnish|marimekko|teenage\s*engineering|bang\s*&\s*olufsen|\bb&o\b|jabra|sennheiser/i.test(
        c.text
      ),
  },
  {
    id: "minimalist",
    label: "Minimalistisk",
    test: (c) =>
      /minimal|clean\s*desk|matte\s*black|slim\s*profile|understated|sleek/i.test(
        c.text
      ) ||
      (c.price != null &&
        c.price >= 300 &&
        c.price <= 900 &&
        !/\brgb\b|gaming|neon/i.test(c.text)),
  },
  {
    id: "smart_home",
    label: "Smart Home",
    test: (c) =>
      /smart\s*home|zigbee|z[\s-]?wave|homekit|alexa|google\s*home|smart\s*(plug|bulb|switch|lock)/i.test(
        c.text
      ) ||
      /hjem/i.test(c.category) ||
      (c.familyId != null && /smart_/.test(c.familyId)),
  },
  {
    id: "streaming",
    label: "Streaming",
    test: (c) =>
      /stream|microphone|boom\s*arm|capture\s*card|ring\s*light|obs\b|elgato|webcam/i.test(
        c.text
      ) ||
      (c.familyId != null &&
        /microphone|webcam|capture|boom_arm|ring_light/.test(c.familyId)),
  },
  {
    id: "diy",
    label: "DIY",
    test: (c) =>
      /diy|maker|raspberry|arduino|soldering|3d\s*print|esp32|breadboard|tool\s*kit/i.test(
        c.text
      ) ||
      (c.familyId != null && /maker|raspberry|arduino|3d_/.test(c.familyId)),
  },
  {
    id: "maker",
    label: "Maker",
    test: (c) =>
      /maker|raspberry|arduino|esp32|cnc|laser\s*engraver|protoboard/i.test(
        c.text
      ) || c.familyId === "maker_tools",
  },
];

const LABEL: Record<StoreDnaTraitId, string> = Object.fromEntries(
  TRAIT_DEFS.map((t) => [t.id, t.label])
) as Record<StoreDnaTraitId, string>;

function emptySnapshot(): StoreDnaSnapshot {
  return {
    version: 1,
    rebuiltAt: new Date().toISOString(),
    productCount: 0,
    traits: TRAIT_DEFS.map((t) => ({
      id: t.id,
      label: t.label,
      pct: 0,
      productCount: 0,
      why: [],
    })),
    strengthens: [],
    weakens: [],
    history: [],
    changeWeek: [],
    changeMonth: [],
  };
}

function parseTags(tags: unknown): string {
  if (typeof tags === "string") return tags;
  if (Array.isArray(tags)) return tags.map(String).join(" ");
  return "";
}

function toCtx(p: {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  tags: unknown;
  price: number;
  supplierPrice: number | null;
}): ProductCtx {
  const title = (p.name || "").trim();
  const category = p.category || "";
  const subcategory = p.subcategory || "";
  const tags = parseTags(p.tags);
  const familyId = matchFamily(title, category);
  const marginPct =
    p.price > 0 && p.supplierPrice != null && p.supplierPrice > 0
      ? ((p.price - p.supplierPrice) / p.price) * 100
      : null;
  return {
    id: p.id,
    title,
    text: `${title} ${category} ${subcategory} ${tags}`.toLowerCase(),
    category,
    subcategory,
    tags,
    price: Number.isFinite(p.price) ? p.price : null,
    marginPct,
    familyId,
    familyLabel: familyId ? familyLabel(familyId) : null,
  };
}

function detectTraits(ctx: ProductCtx): StoreDnaTraitId[] {
  return TRAIT_DEFS.filter((t) => t.test(ctx)).map((t) => t.id);
}

function parseSnapshot(raw: unknown): StoreDnaSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as StoreDnaSnapshot;
  if (v.version !== 1 || !Array.isArray(v.traits)) return null;
  return v;
}

function historyDelta(
  current: StoreDnaTrait[],
  history: StoreDnaHistoryPoint[],
  olderThanMs: number,
  now: number
): StoreDnaChange[] {
  const cutoff = now - olderThanMs;
  // Find oldest point still within window, or first point before cutoff
  let baseline: StoreDnaHistoryPoint | null = null;
  for (const h of history) {
    const t = new Date(h.at).getTime();
    if (!Number.isFinite(t)) continue;
    if (t <= cutoff) {
      baseline = h;
      break;
    }
    baseline = h; // keep most recent as fallback until we find older
  }
  // Prefer the latest history point that is at least olderThanMs ago
  const candidates = history.filter(
    (h) => now - new Date(h.at).getTime() >= olderThanMs * 0.7
  );
  const base =
    candidates.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    )[0] || baseline;

  if (!base) return [];

  const fromMap = new Map(base.traits.map((t) => [t.id, t.pct]));
  return current
    .map((t) => {
      const from = fromMap.get(t.id) ?? 0;
      return {
        id: t.id,
        label: t.label,
        from,
        to: t.pct,
        delta: Math.round((t.pct - from) * 10) / 10,
      };
    })
    .filter((c) => Math.abs(c.delta) >= 0.5)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 8);
}

/**
 * Rebuild Store DNA from active catalog. No LLM.
 */
export async function rebuildStoreDna(opts?: {
  storeId?: string | null;
}): Promise<StoreDnaSnapshot> {
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const prevRow = await prisma.setting.findUnique({
    where: { key: STORE_DNA_SETTING_KEY },
  });
  const previous = parseSnapshot(prevRow?.value);

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(opts?.storeId ? { storeId: opts.storeId } : {}),
    },
    select: {
      id: true,
      name: true,
      category: true,
      subcategory: true,
      tags: true,
      price: true,
      supplierPrice: true,
    },
    take: 5000,
  });

  const n = products.length || 1;
  const counts = new Map<StoreDnaTraitId, number>();
  const examples = new Map<StoreDnaTraitId, string[]>();
  for (const t of TRAIT_DEFS) {
    counts.set(t.id, 0);
    examples.set(t.id, []);
  }

  type Scored = {
    productId: string;
    title: string;
    traits: StoreDnaTraitId[];
    alignment: number;
  };
  const scored: Scored[] = [];

  for (const p of products) {
    const ctx = toCtx(p);
    const traits = detectTraits(ctx);
    for (const id of traits) {
      counts.set(id, (counts.get(id) || 0) + 1);
      const ex = examples.get(id)!;
      if (ex.length < 3) ex.push(ctx.title.slice(0, 60));
    }
    // Temporary alignment — refined after trait % known
    scored.push({
      productId: ctx.id,
      title: ctx.title || "Uten tittel",
      traits,
      alignment: 0,
    });
  }

  const traits: StoreDnaTrait[] = TRAIT_DEFS.map((t) => {
    const count = counts.get(t.id) || 0;
    const pct =
      products.length === 0
        ? 0
        : Math.round(Math.min(100, (count / n) * 100) * 10) / 10;
    const why: string[] = [];
    if (count > 0) {
      why.push(`${count} aktive produkter matcher ${t.label}`);
      const ex = examples.get(t.id) || [];
      if (ex[0]) why.push(`F.eks. ${ex[0]}`);
    } else {
      why.push(`Lite/ingen ${t.label} i katalogen ennå`);
    }
    return {
      id: t.id,
      label: t.label,
      pct,
      productCount: count,
      why,
    };
  }).sort((a, b) => b.pct - a.pct);

  const topIds = new Set(
    traits.filter((t) => t.pct >= 8).slice(0, 5).map((t) => t.id)
  );
  const weakIds = new Set(
    traits.filter((t) => t.pct < 5 || t.id === "budget").map((t) => t.id)
  );
  // If store is premium-leaning, budget products weaken identity
  const premiumLean =
    (traits.find((t) => t.id === "premium")?.pct || 0) >= 20 ||
    (traits.find((t) => t.id === "high_end")?.pct || 0) >= 12;
  const gamingLean = (traits.find((t) => t.id === "gaming")?.pct || 0) >= 25;

  for (const s of scored) {
    let align = 0;
    const whyBits: string[] = [];
    for (const id of s.traits) {
      if (topIds.has(id)) {
        align += 2;
        whyBits.push(LABEL[id]);
      }
      if (premiumLean && id === "budget") {
        align -= 3;
        whyBits.push("lavpris mot premium-profil");
      }
      if (gamingLean && id === "budget" && !s.traits.includes("gaming")) {
        align -= 1;
      }
      if (weakIds.has(id) && !topIds.has(id) && id !== "budget") {
        align -= 0.5;
      }
    }
    if (s.traits.length === 0) align -= 1;
    s.alignment = align;
    (s as Scored & { why?: string }).why = whyBits.slice(0, 3).join(", ");
  }

  const withWhy = scored as Array<Scored & { why?: string }>;
  const strengthens = [...withWhy]
    .filter((s) => s.alignment > 0 && s.traits.some((t) => topIds.has(t)))
    .sort((a, b) => b.alignment - a.alignment)
    .slice(0, 12)
    .map((s) => ({
      productId: s.productId,
      title: s.title,
      traitIds: s.traits.filter((t) => topIds.has(t)),
      alignment: s.alignment,
      why: s.why
        ? `Styrker: ${s.why}`
        : `Styrker butikkidentitet (${s.traits.map((t) => LABEL[t]).join(", ")})`,
    }));

  const weakens = [...withWhy]
    .filter((s) => s.alignment < 0)
    .sort((a, b) => a.alignment - b.alignment)
    .slice(0, 12)
    .map((s) => ({
      productId: s.productId,
      title: s.title,
      traitIds: s.traits,
      alignment: s.alignment,
      why: s.why
        ? `Svekker: ${s.why}`
        : "Passer dårlig med dagens butikk-DNA",
    }));

  // History: append point if last is > 20h old or missing
  const history = [...(previous?.history || [])];
  const lastAt = history[0] ? new Date(history[0].at).getTime() : 0;
  if (!lastAt || nowMs - lastAt > 20 * 60 * 60_000) {
    history.unshift({
      at: nowIso,
      traits: traits.map((t) => ({ id: t.id, pct: t.pct })),
    });
  } else {
    // refresh latest point in place for same-day publishes
    history[0] = {
      at: nowIso,
      traits: traits.map((t) => ({ id: t.id, pct: t.pct })),
    };
  }
  while (history.length > HISTORY_MAX) history.pop();

  const changeWeek = historyDelta(
    traits,
    history.slice(1),
    7 * 24 * 60 * 60_000,
    nowMs
  );
  const changeMonth = historyDelta(
    traits,
    history.slice(1),
    30 * 24 * 60 * 60_000,
    nowMs
  );

  const snapshot: StoreDnaSnapshot = {
    version: 1,
    rebuiltAt: nowIso,
    productCount: products.length,
    traits,
    strengthens,
    weakens,
    history,
    changeWeek,
    changeMonth,
  };

  await prisma.setting.upsert({
    where: { key: STORE_DNA_SETTING_KEY },
    create: {
      key: STORE_DNA_SETTING_KEY,
      value: snapshot as unknown as Prisma.InputJsonValue,
    },
    update: { value: snapshot as unknown as Prisma.InputJsonValue },
  });

  return snapshot;
}

/** Load cached DNA; rebuild if missing/stale. */
export async function getStoreDna(opts?: {
  storeId?: string | null;
  forceRebuild?: boolean;
}): Promise<StoreDnaSnapshot> {
  if (!opts?.forceRebuild) {
    const row = await prisma.setting.findUnique({
      where: { key: STORE_DNA_SETTING_KEY },
    });
    const cached = parseSnapshot(row?.value);
    if (cached) {
      const age = Date.now() - new Date(cached.rebuiltAt).getTime();
      if (Number.isFinite(age) && age < STALE_MS) return cached;
    }
  }
  try {
    return await rebuildStoreDna({ storeId: opts?.storeId });
  } catch {
    return emptySnapshot();
  }
}

/**
 * Small additive signal for a candidate vs observed store DNA.
 * Cap ±DNA_NUDGE_MAX — never dominates Merch Brain.
 */
export function scoreStoreDna(
  dna: StoreDnaSnapshot,
  candidate: {
    title: string;
    categoryHint?: string | null;
    priceNOK?: number | null;
  }
): StoreDnaNudge {
  const ctx = toCtx({
    id: "candidate",
    name: candidate.title,
    category: candidate.categoryHint || null,
    subcategory: null,
    tags: "",
    price: candidate.priceNOK ?? 0,
    supplierPrice: null,
  });
  const matched = detectTraits(ctx);
  const byId = new Map(dna.traits.map((t) => [t.id, t]));
  const top = dna.traits.filter((t) => t.pct >= 10).slice(0, 5);
  const topIds = new Set(top.map((t) => t.id));

  let raw = 0;
  const why: string[] = [];
  const matchedTraits: StoreDnaNudge["matchedTraits"] = [];

  for (const id of matched) {
    const t = byId.get(id);
    if (!t) continue;
    matchedTraits.push({ id: t.id, label: t.label, pct: t.pct });
    if (topIds.has(id)) {
      raw += Math.min(2, t.pct / 40);
      why.push(`✔ Styrker butikk-DNA: ${t.label} (${Math.round(t.pct)}%)`);
    } else if (t.pct < 5) {
      raw -= 0.6;
      why.push(`⚠ Lite i butikk-DNA: ${t.label}`);
    }
  }

  const premiumPct = byId.get("premium")?.pct || 0;
  if (premiumPct >= 25 && matched.includes("budget")) {
    raw -= 1.5;
    why.push("⚠ Lavprisprodukt mot premium-profil");
  }

  const nudge = Math.max(
    -DNA_NUDGE_MAX,
    Math.min(DNA_NUDGE_MAX, Math.round(raw))
  );
  const dnaScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        matched.reduce((s, id) => s + (byId.get(id)?.pct || 0), 0) /
          Math.max(1, matched.length)
      )
    )
  );

  if (matched.length === 0) {
    why.push("Ingen tydelig DNA-match ennå");
  }

  return {
    nudge,
    dnaScore,
    why: why.slice(0, 4),
    matchedTraits,
  };
}

export function applyStoreDnaNudge(
  butikkscore: number,
  nudge: StoreDnaNudge
): {
  butikkscore: number;
  dnaNudge: number;
  dnaScore: number;
  dnaWhy: string[];
} {
  const capped = Math.max(
    -DNA_NUDGE_MAX,
    Math.min(DNA_NUDGE_MAX, nudge.nudge)
  );
  return {
    butikkscore: Math.max(0, Math.min(100, Math.round(butikkscore + capped))),
    dnaNudge: capped,
    dnaScore: nudge.dnaScore,
    dnaWhy: nudge.why,
  };
}
