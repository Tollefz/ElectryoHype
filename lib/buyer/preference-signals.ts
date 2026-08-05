/**
 * Parse free-text admin preference rules into transparent boost/penalty signals.
 * General — not hard-coded to phone cases. Uses product-family vocabulary.
 */

import {
  PRODUCT_FAMILIES,
  matchFamily,
  type ProductFamily,
} from "@/lib/intelligence/families";

export type ParsedRuleIntent = "prioritize" | "deprioritize" | "avoid" | "quality" | "neutral";

export type ParsedPreferenceRule = {
  raw: string;
  intent: ParsedRuleIntent;
  families: Array<{ id: string; label: string }>;
  keywords: string[];
};

export type PreferenceImpact = {
  storeRelevance: number;
  signals: Array<{
    id: string;
    polarity: "plus" | "minus" | "neutral";
    label: string;
    points: number;
  }>;
  matchedRules: string[];
};

const DEPRIORITIZE_RE =
  /færre|nedprior|unngå|unnga|ikke\s+selg|ikke\s+anbefal|vis\s+mye\s+færre|mindre\s+av|ikke\s+vil\s+(ha|selge)|dominere|ikke\s+la\s+én|ikke\s+som\s+en\s+tilfeldig|gadget-?\s*eller|mobiltilbehørsbutikk/i;

const AVOID_RE =
  /unngå|unnga|ikke\s+hører\s+hjemme|ikke\s+naturlig|leketøy|pyntegjenstand|klær|solcelle|tilfeldige\s+gadgets/i;

const PRIORITIZE_RE =
  /prioriter|satse|finn\s+også|gode\s+produkter\s+innen|innen\s+pc|retning\s+komplett|seriøs\s+norsk\s+elektronikk|bygg.*elektronikkbutikk|vil\s+ha\s+et\s+balansert|kvalitet\s+og\s+relevans/i;

/** Extra keyword → family id aliases beyond PRODUCT_FAMILIES labels */
const KEYWORD_FAMILY: Array<{ re: RegExp; familyId: string }> = [
  { re: /mobildeksel|phone\s*case|telefonaccessoir|telefon\-?access/i, familyId: "phone_case" },
  { re: /skjermbeskytter|screen\s*protector/i, familyId: "screen_protector" },
  { re: /gamingmus|gaming\s*mouse/i, familyId: "gaming_mouse" },
  { re: /musematte|mouse\s*pad/i, familyId: "mouse_pad" },
  { re: /tastatur|keyboard/i, familyId: "keyboard" },
  { re: /headset|hodetelefon/i, familyId: "headset" },
  { re: /usb\-?\s*hub|dokking|docking/i, familyId: "usb_c_hub" },
  { re: /ssd|lagring|storage/i, familyId: "ssd" },
  { re: /nettverk|router|wifi|mesh/i, familyId: "network" },
  { re: /mikrofon|microphone|streaming/i, familyId: "microphone" },
  { re: /smart\-?\s*hjem|smart\s*home|smarte\s*lys|sensorer|overvåkning/i, familyId: "smart_home" },
  { re: /powerbank|nødlader/i, familyId: "powerbank" },
  { re: /lader|charger/i, familyId: "charger" },
  { re: /kontroller|controller|gamepad/i, familyId: "controller" },
  { re: /høyttaler|speaker/i, familyId: "speaker" },
];

function familyById(id: string): ProductFamily | undefined {
  return PRODUCT_FAMILIES.find((f) => f.id === id);
}

function extractFamiliesFromRule(rule: string): Array<{ id: string; label: string }> {
  const found = new Map<string, string>();
  const low = rule.toLowerCase();

  for (const fam of PRODUCT_FAMILIES) {
    if (low.includes(fam.label.toLowerCase())) {
      found.set(fam.id, fam.label);
      continue;
    }
    if (fam.patterns.some((p) => p.test(rule))) {
      found.set(fam.id, fam.label);
    }
  }

  for (const { re, familyId } of KEYWORD_FAMILY) {
    if (re.test(rule)) {
      const fam = familyById(familyId);
      found.set(familyId, fam?.label || familyId);
    }
  }

  return [...found.entries()].map(([id, label]) => ({ id, label }));
}

export function parsePreferenceRules(rules: string[]): ParsedPreferenceRule[] {
  return (rules || []).map((raw) => {
    const text = raw.trim();
    let intent: ParsedRuleIntent = "neutral";
    if (AVOID_RE.test(text) && DEPRIORITIZE_RE.test(text)) intent = "avoid";
    else if (DEPRIORITIZE_RE.test(text)) intent = "deprioritize";
    else if (AVOID_RE.test(text)) intent = "avoid";
    else if (PRIORITIZE_RE.test(text)) intent = "prioritize";
    else if (/margin|levering|bilder|kvalitet|👍|👎/.test(text.toLowerCase())) {
      intent = "quality";
    }

    const families = extractFamiliesFromRule(text);
    return { raw: text, intent, families, keywords: families.map((f) => f.label) };
  });
}

export function resolveProductFamilyIds(
  title: string,
  categoryHint?: string | null
): string[] {
  const ids: string[] = [];
  const primary = matchFamily(title, categoryHint);
  if (primary) ids.push(primary);
  for (const fam of PRODUCT_FAMILIES) {
    if (ids.includes(fam.id)) continue;
    if (fam.patterns.some((p) => p.test(title))) ids.push(fam.id);
  }
  return ids;
}

/**
 * Apply parsed rules + thumbs to a product title → store relevance + signals.
 */
export function evaluatePreferenceImpact(input: {
  title: string;
  categoryHint?: string | null;
  rules: string[];
  likes?: string[];
  dislikes?: string[];
  /** Count of same-family candidates/products already in pool */
  familyCounts?: Record<string, number>;
  poolSize?: number;
}): PreferenceImpact {
  const parsed = parsePreferenceRules(input.rules || []);
  let familyIds = resolveProductFamilyIds(input.title, input.categoryHint);
  // Avoid false family hits like "Keyboard Phone Case" counting as tastatur
  if (familyIds.includes("phone_case")) {
    familyIds = familyIds.filter(
      (id) =>
        !["keyboard", "mechanical_keyboard", "mouse", "gaming_mouse"].includes(
          id
        )
    );
  }
  const signals: PreferenceImpact["signals"] = [];
  const matchedRules: string[] = [];
  let relevance = 52; // neutral baseline

  for (const rule of parsed) {
    const hitFamilies = rule.families.filter((f) => familyIds.includes(f.id));
    const hit = hitFamilies.length > 0;

    if (rule.intent === "prioritize") {
      if (hit) {
        const pts = Math.min(18, 8 + hitFamilies.length * 3);
        relevance += pts;
        signals.push({
          id: `pref_boost_${hitFamilies[0].id}`,
          polarity: "plus",
          label: `Butikkprofil prioriterer ${hitFamilies.map((f) => f.label).join(", ")}`,
          points: pts,
        });
        matchedRules.push(rule.raw);
      } else if (rule.families.length > 0) {
        // Product outside prioritized set — soft downrank
        relevance -= 4;
      }
    }

    if (rule.intent === "deprioritize" || rule.intent === "avoid") {
      if (hit) {
        const pts =
          rule.intent === "avoid"
            ? -Math.min(28, 16 + hitFamilies.length * 4)
            : -Math.min(22, 12 + hitFamilies.length * 4);
        relevance += pts;
        signals.push({
          id: `pref_down_${hitFamilies[0].id}`,
          polarity: "minus",
          label:
            rule.intent === "avoid"
              ? `Butikkprofil unngår ${hitFamilies.map((f) => f.label).join(", ")}`
              : `Butikkprofil nedprioriterer ${hitFamilies.map((f) => f.label).join(", ")}`,
          points: pts,
        });
        matchedRules.push(rule.raw);
      }
    }
  }

  // Thumbs: learn patterns via family / category / title tokens — not only exact ID
  const titleLow = input.title.toLowerCase();
  const likeBoosts = new Set<string>();
  for (const like of input.likes || []) {
    const low = like.toLowerCase();
    if (low.startsWith("kategori:") || low.startsWith("underkategori:")) {
      const token = low.split(":")[1] || "";
      if (token.length > 2 && titleLow.includes(token.slice(0, 20))) {
        likeBoosts.add(`cat:${token}`);
      }
    }
    if (low.startsWith("family:")) {
      const fid = low.slice("family:".length);
      if (familyIds.includes(fid)) likeBoosts.add(`family:${fid}`);
    }
    if (low.startsWith("tittel:")) {
      const token = low.slice("tittel:".length).slice(0, 28);
      // Require meaningful overlap (not noise)
      const words = token.split(/\s+/).filter((w) => w.length > 3);
      const overlap = words.filter((w) => titleLow.includes(w)).length;
      if (overlap >= 2) likeBoosts.add(`title:${token.slice(0, 16)}`);
    }
  }
  if (likeBoosts.size) {
    const pts = Math.min(16, 6 * likeBoosts.size);
    relevance += pts;
    signals.push({
      id: "liked_pattern",
      polarity: "plus",
      label: "Ligner produkter/mønstre admin har likt",
      points: pts,
    });
  }

  const dislikeHits: string[] = [];
  for (const d of input.dislikes || []) {
    const low = d.toLowerCase();
    if (low.startsWith("family:") && familyIds.includes(low.slice(7))) {
      dislikeHits.push(low);
    }
    if (low.startsWith("dislike:") || low.includes("passer_ikke") || low.includes("darlig_produkt")) {
      const piece = low.split(":").pop() || "";
      const words = piece.split(/\s+/).filter((w) => w.length > 3);
      if (words.filter((w) => titleLow.includes(w)).length >= 2) {
        dislikeHits.push(piece.slice(0, 24));
      }
    }
    // Pattern: avoid_category_signal:Mobildeksel
    if (low.startsWith("avoid_category_signal:")) {
      const cat = low.split(":")[1] || "";
      if (cat && titleLow.includes(cat.toLowerCase().slice(0, 10))) {
        dislikeHits.push(cat);
      }
    }
  }
  if (dislikeHits.length) {
    const pts = -Math.min(22, 8 * dislikeHits.length);
    relevance += pts;
    signals.push({
      id: "disliked_pattern",
      polarity: "minus",
      label: "Ligner produkter/mønstre admin har mislikt",
      points: pts,
    });
  }

  // Assortment saturation / diversity
  const counts = input.familyCounts || {};
  const pool = Math.max(1, input.poolSize || 0);
  for (const fid of familyIds) {
    const n = counts[fid] || 0;
    if (n <= 0) continue;
    const share = pool > 0 ? n / pool : 0;
    if (n >= 12 && share >= 0.08) {
      const pts = -Math.min(18, 6 + Math.floor(n / 8) * 3);
      relevance += pts;
      const label = familyById(fid)?.label || fid;
      signals.push({
        id: `sat_${fid}`,
        polarity: "minus",
        label: `Mange lignende allerede (${label}: ${n})`,
        points: pts,
      });
    } else if (n <= 2 && pool >= 20) {
      const pts = 5;
      relevance += pts;
      signals.push({
        id: `gap_${fid}`,
        polarity: "plus",
        label: `Fyller tynt sortiment (${familyById(fid)?.label || fid})`,
        points: pts,
      });
    }
  }

  return {
    storeRelevance: Math.max(0, Math.min(100, Math.round(relevance))),
    signals,
    matchedRules,
  };
}

/** Hard cap: low store relevance cannot be rescued by margin. */
export function applyRelevanceCap(
  rawScore: number,
  storeRelevance: number
): { pct: number; capped: boolean; capReason?: string } {
  let pct = Math.max(0, Math.min(100, Math.round(rawScore)));
  let capped = false;
  let capReason: string | undefined;
  if (storeRelevance < 30 && pct > 48) {
    pct = 48;
    capped = true;
    capReason = "Tak: svært lav butikkrelevans";
  } else if (storeRelevance < 40 && pct > 62) {
    pct = 62;
    capped = true;
    capReason = "Tak: lav butikkrelevans";
  } else if (storeRelevance < 50 && pct > 74) {
    pct = 74;
    capped = true;
    capReason = "Tak: middels butikkrelevans";
  }
  return { pct, capped, capReason };
}
