/**
 * Storefront curation — premium product selection for homepage & recommendations.
 *
 * Extensible exclusion lists + family/image diversification + image preference.
 * Products excluded here remain findable via search / category browse.
 */

import { matchFamily } from "@/lib/intelligence/families";

/** Surfaces that must never show "frontpage-excluded" products. */
export type CuratedSurface =
  | "home"
  | "related"
  | "recommended"
  | "deals"
  | "newest";

/**
 * Normalize for fuzzy matching: lowercase, strip punctuation, collapse space.
 * "Car Jump-Starter!" → "car jump starter"
 */
export function normalizeMatchText(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Phrase / token exclusions (matched on normalized blob).
 * Keep electronics false-positives out via ALLOWLIST below.
 */
export const FRONTPAGE_EXCLUSION_PHRASES: string[] = [
  // Jump / booster / car battery
  "jump starter",
  "jumper starter",
  "jumpstarter",
  "jumperstarter",
  "jump pack",
  "jumppack",
  "jump box",
  "jumper box",
  "battery booster",
  "battery jump",
  "battery jumper",
  "emergency starter",
  "emergency battery",
  "portable starter",
  "vehicle starter",
  "car starter",
  "auto starter",
  "automotive starter",
  "car jump",
  "car jumper",
  "car booster",
  "auto booster",
  "power booster",
  "engine starter",
  "starter booster",
  "booster battery",
  "booster pack",
  "portable car starter",
  "portable car battery",
  "car battery starter",
  "car battery booster",
  "car battery jump",
  "vehicle jump",
  "automotive battery",
  "car battery charger",
  "battery charger car",
  "battery repair",
  "battery maintainer",
  "jump cable",
  "jumper cable",
  "booster cable",
  "startkabel",
  "starthjelp",
  "bilbatteri",
  "bil starter",
  "bilstarter",
  "startbooster",
  "start booster",
  // Workshop / hydraulic / garage
  "porta power",
  "portapower",
  "hydraulic jack",
  "hydraulic ram",
  "hydraulic pump",
  "dent repair",
  "garage tools",
  "vehicle repair",
  "car repair",
  "auto repair",
  "automotive repair",
  "workshop tools",
  "tire inflator",
  "tyre inflator",
  "engine oil",
  "socket set",
  "jack kit",
  "floor jack",
  "car jack",
  // Automotive lighting / body parts (not electronics retail)
  "taillight",
  "tail light",
  "tail lamp",
  "brake lamp",
  "brake light",
  "headlight",
  "head lamp",
  "fog light",
  "fog lamp",
  "turn signal lamp",
  "car bulb",
  "auto bulb",
];

/** Regex on normalized text (spaces already collapsed). */
export const FRONTPAGE_EXCLUSION_PATTERNS: RegExp[] = [
  /\bjump\s*starter\b/,
  /\bjumper\s*starter\b/,
  /\bjump\s*pack\b/,
  /\bjump\s*box\b/,
  /\bjumper\s*box\b/,
  /\bbattery\s*booster\b/,
  /\bbattery\s*jump(?:er)?\b/,
  /\bemergency\s*(?:starter|battery|jump)\b/,
  /\bportable\s*(?:car\s*)?(?:starter|jump)\b/,
  /\b(?:vehicle|car|auto|automotive)\s*(?:starter|jump|booster|jumper)\b/,
  /\b(?:starter|jump|jumper)\s*(?:booster|battery|pack|box|cable)\b/,
  /\bbooster\s*(?:battery|pack|cable|box)\b/,
  /\bpower\s*booster\b/,
  /\bengine\s*starter\b/,
  /\b(?:car|auto|vehicle)\s*battery\b/,
  /\bbattery\s*(?:charger|maintainer|repair)\s*(?:car|auto|vehicle)?\b/,
  /\b(?:car|auto|vehicle)\s*battery\s*(?:charger|maintainer|booster|starter)\b/,
  /\b(?:jump|jumper|booster)\s*cable\b/,
  /\b\d+\s*a\s*peak\b.*\b(?:car|jump|jumper|booster)\b/,
  /\b(?:car|jump|jumper|booster)\b.*\b\d+\s*a\s*peak\b/,
  /\b\d{4,5}\s*mah\b.*\b(?:car|jump|jumper|booster)\b/,
  /\b(?:car|jump|jumper|booster)\b.*\b\d{4,5}\s*mah\b/,
  /\bporta\s*power\b/,
  /\bhydraulic\b/,
  /\bdent\s*repair\b/,
  /\bgarage\s*(?:tool|kit|equipment)\b/,
  /\bworkshop\b/,
  /\b(?:vehicle|car|auto|automotive)\s*repair\b/,
  /\b(?:tire|tyre)\s*inflator\b/,
  /\bfloor\s*jack\b/,
  /\bcar\s*jack\b/,
  /\bjack\s*kit\b/,
  /\b\d+\s*ton\b/,
  /\bsocket\s*set\b/,
  /\bengine\s*oil\b/,
  /\bstarthjelp\b/,
  /\bbilbatteri\b/,
  /\bstartkabel\b/,
  /\bstartbooster\b/,
  /\bbil\s*starter\b/,
  /\b(?:tail|brake|head|fog)\s*(?:light|lamp)s?\b/,
  /\btaillight\b/,
  /\bturn\s*signal\s*(?:lamp|light)\b/,
  /\b(?:car|auto|vehicle)\s*bulb\b/,
  // Bare "booster" / "starter pack" when automotive-adjacent context exists elsewhere,
  // plus standalone product-title style boosters that aren't wifi/signal.
  /\bbooster\b(?!.*\b(?:wifi|wi fi|signal|antenna|cellular|4g|5g|lte|router)\b)/,
  /\bstarter\s*pack\b(?!.*\b(?:gaming|game|pc|kit|bundle|rgb)\b)/,
  /\bautomotive\b/,
];

/** Soft-exclude non-electronics retail feel (also gated from curated surfaces). */
export const FRONTPAGE_SOFT_EXCLUDE_PATTERNS: RegExp[] = [
  /\bdumbbell\b/,
  /\bhammock\b/,
  /\bcamping\b/,
  /\bskin\s*tag\b/,
  /\bhair\s*styler\b/,
  /\bcurler\b/,
  /\bstraightener\b/,
  /\bfidget\b/,
  /\bkeychain\b/,
  /\bnokkelring\b/,
  /\btoy\b/,
  /\bleketoy\b/,
  /\byoga\b/,
  /\bfitness\b/,
  /\bwrench\b/,
  /\bair\s*compressor\b/,
];

/**
 * AI / taxonomy labels that force soft-hard exclusion from curated rows.
 */
export const CURATED_AI_EXCLUSION_PATTERNS: RegExp[] = [
  /\bautomotive\b/,
  /\bvehicle\b/,
  /\bworkshop\b/,
  /\bgarage\b/,
  /\brepair\b/,
  /\bemergency\s*vehicle\b/,
  /\bcar\s*accessories?\b/,
  /\bauto\s*parts?\b/,
];

/** Prefer keep these even if a broad token (e.g. booster) appears. */
const EXCLUSION_ALLOWLIST: RegExp[] = [
  /\b(?:wifi|wi fi|signal|antenna|cellular|4g|5g|lte|router)\s*booster\b/,
  /\b(?:gaming|game|pc|rgb)\s*starter\s*(?:pack|kit|bundle)\b/,
  /\bphone\s*battery\b/,
  /\blaptop\s*battery\b/,
  /\bpowerbank\b/,
  /\bpower\s*bank\b/,
  /\busb\s*(?:c\s*)?battery\b/,
];

/** Soft-penalize / avoid flooding curated rows with these. */
export const LOW_PREMIUM_PATTERNS: RegExp[] = [
  /\bus\s*seller\b/,
  /\bfree\s*shipping\b/,
  /\bdrop\s*ship/,
  /\baliexpress\b/,
  /\btemu\b/,
  /\bce\s*certified\b/,
  /\bhot\s*sale\b/,
  /\bbig\s*sale\b/,
  /\bflash\s*sale\b/,
  /\b100%\s*new\b/,
  /\boriginal\s*genuine\b/,
  /\bwholesale\b/,
  /\bfactory\s*direct\b/,
  /\brgb\s*gadget\b/,
  /\bfidget\b/,
  /\bnovelty\b/,
  /\bkeychain\b/,
  /\bnokkelring\b/,
];

/** Image URL / filename signals that look like supplier marketing creatives. */
export const IMAGE_JUNK_PATTERNS: RegExp[] = [
  /us[-_\s]?seller/i,
  /free[-_\s]?shipping/i,
  /aliexpress/i,
  /watermark/i,
  /promo[-_\s]?badge/i,
  /hot[-_\s]?sale/i,
  /big[-_\s]?sale/i,
  /banner/i,
  /campaign/i,
  /advert/i,
  /coupon/i,
  /ce[-_\s]?mark/i,
  /certificate/i,
  /chin[ae]/i,
  /taobao/i,
  /1688/i,
];

const PREFERRED_CATEGORIES = new Set([
  "Gaming",
  "Mobil & Tilbehør",
  "TV, Lyd & Bilde",
  "Data & IT",
  "Hjem & Fritid",
]);

/** Mild penalty — USB car chargers etc. still OK but deprioritized. */
const CAR_ACCESSORY_SOFT =
  /\b(car\s*(charger|holder|mount|vacuum)|bil(lader|holder)|cigarette\s*lighter|dash\s*cam)\b/;

/** Curation score penalties for automotive / workshop signals. */
export const CURATION_SCORE_PENALTIES: Array<{
  label: string;
  pattern: RegExp;
  penalty: number;
}> = [
  { label: "Emergency vehicle", pattern: /emergency\s*(vehicle|starter|battery|jump)/, penalty: -150 },
  { label: "Automotive", pattern: /automotive|(?:car|vehicle|auto)\s*(?:jump|starter|booster|battery)|jump\s*starter|battery\s*booster/, penalty: -100 },
  { label: "Repair", pattern: /\b(?:car|auto|vehicle|dent)\s*repair\b|\bbattery\s*repair\b/, penalty: -100 },
  { label: "Workshop", pattern: /workshop|garage\s*tool|hydraulic|porta\s*power|socket\s*set|\d+\s*ton/, penalty: -80 },
];

export type CuratableProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice?: number | null;
  images: string;
  category?: string | null;
  subcategory?: string | null;
  tags?: string | null;
  qualityScore?: number | null;
  description?: string | null;
  shortDescription?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  aiCategorySuggested?: string | null;
  aiCategoryReason?: string | null;
};

export type ExclusionProbe = {
  name?: string | null;
  slug?: string | null;
  category?: string | null;
  subcategory?: string | null;
  tags?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  aiCategorySuggested?: string | null;
  aiCategoryReason?: string | null;
  keywords?: string | null;
  supplierCategory?: string | null;
};

/** Build searchable blob from all known merchandising / AI / supplier fields. */
export function curationTextBlob(p: ExclusionProbe): string {
  return [
    p.name,
    p.slug,
    p.category,
    p.subcategory,
    p.tags,
    p.description,
    p.shortDescription,
    p.metaTitle,
    p.metaDescription,
    p.aiCategorySuggested,
    p.aiCategoryReason,
    p.keywords,
    p.supplierCategory,
  ]
    .filter(Boolean)
    .join(" ");
}

function matchesPhraseList(normalized: string, phrases: string[]): boolean {
  for (const phrase of phrases) {
    const needle = normalizeMatchText(phrase);
    if (!needle) continue;
    if (normalized.includes(needle)) return true;
    // Also match compacted form (jump starter → jumpstarter)
    const compact = needle.replace(/\s+/g, "");
    const blobCompact = normalized.replace(/\s+/g, "");
    if (compact.length >= 6 && blobCompact.includes(compact)) return true;
  }
  return false;
}

/**
 * True when product must not appear on curated merchandising surfaces.
 * Still searchable / browsable in catalog.
 */
export function isFrontpageExcluded(p: ExclusionProbe): boolean {
  const raw = curationTextBlob(p);
  const normalized = normalizeMatchText(raw);
  if (!normalized) return false;

  if (EXCLUSION_ALLOWLIST.some((re) => re.test(normalized))) {
    // Still exclude if a strong automotive phrase is also present
    const strong =
      /\b(?:jump\s*starter|jumper\s*starter|battery\s*booster|car\s*jump|starthjelp|hydraulic|porta\s*power)\b/.test(
        normalized
      );
    if (!strong) return false;
  }

  if (matchesPhraseList(normalized, FRONTPAGE_EXCLUSION_PHRASES)) return true;
  if (FRONTPAGE_EXCLUSION_PATTERNS.some((re) => re.test(normalized))) return true;
  if (FRONTPAGE_SOFT_EXCLUDE_PATTERNS.some((re) => re.test(normalized)))
    return true;

  const aiBlob = normalizeMatchText(
    [p.aiCategorySuggested, p.aiCategoryReason, p.category, p.subcategory]
      .filter(Boolean)
      .join(" ")
  );
  if (
    aiBlob &&
    CURATED_AI_EXCLUSION_PATTERNS.some((re) => re.test(aiBlob))
  ) {
    return true;
  }

  return false;
}

/** Why excluded — for QA reports. */
export function frontpageExclusionReason(p: ExclusionProbe): string | null {
  if (!isFrontpageExcluded(p)) return null;
  const normalized = normalizeMatchText(curationTextBlob(p));
  for (const phrase of FRONTPAGE_EXCLUSION_PHRASES) {
    const needle = normalizeMatchText(phrase);
    if (needle && normalized.includes(needle)) return `phrase:${phrase}`;
  }
  for (const re of FRONTPAGE_EXCLUSION_PATTERNS) {
    if (re.test(normalized)) return `pattern:${re.source}`;
  }
  for (const re of FRONTPAGE_SOFT_EXCLUDE_PATTERNS) {
    if (re.test(normalized)) return `soft:${re.source}`;
  }
  const aiBlob = normalizeMatchText(
    [p.aiCategorySuggested, p.aiCategoryReason, p.category, p.subcategory]
      .filter(Boolean)
      .join(" ")
  );
  for (const re of CURATED_AI_EXCLUSION_PATTERNS) {
    if (re.test(aiBlob)) return `ai:${re.source}`;
  }
  return "excluded";
}

export function parseImageUrls(images: string | string[] | null | undefined): string[] {
  if (!images) return [];
  try {
    const parsed =
      typeof images === "string"
        ? images.startsWith("http")
          ? [images]
          : JSON.parse(images)
        : images;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (u): u is string =>
        typeof u === "string" &&
        u.startsWith("http") &&
        !u.includes("placehold")
    );
  } catch {
    return typeof images === "string" && images.startsWith("http")
      ? [images]
      : [];
  }
}

function scoreImageUrl(url: string, index: number): number {
  let score = 40 - index * 2; // slight preference for earlier gallery slots
  const u = url.toLowerCase();
  if (IMAGE_JUNK_PATTERNS.some((re) => re.test(u))) score -= 50;
  if (/white|studio|packshot|product[-_]?main|hero/.test(u)) score += 12;
  if (/lifestyle|scene|banner|promo|sale|ad[-_]?/.test(u)) score -= 8;
  if (/\.(webp|jpg|jpeg|png)(\?|$)/i.test(u)) score += 2;
  // Very long query strings often = marketplace CDN with overlays
  if ((url.split("?")[1] || "").length > 120) score -= 6;
  return score;
}

/**
 * Pick the cleanest listing image. Returns null if none usable.
 */
export function pickCleanestImage(
  images: string | string[] | null | undefined
): string | null {
  const urls = parseImageUrls(images);
  if (urls.length === 0) return null;
  const ranked = urls
    .map((url, index) => ({ url, score: scoreImageUrl(url, index) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 0) return null;
  return best.url;
}

/** True if product has at least one acceptable storefront image. */
export function hasAcceptableStorefrontImage(
  images: string | string[] | null | undefined
): boolean {
  return pickCleanestImage(images) != null;
}

/**
 * Stable product-family key for diversification (one per section/row).
 */
export function productFamilyKey(p: {
  name: string;
  category?: string | null;
}): string {
  const family = matchFamily(p.name, p.category);
  if (family) return `fam:${family}`;

  // Fallback: normalize title tokens (strip colors / sizes / wireless fluff)
  const normalized = p.name
    .toLowerCase()
    .replace(
      /\b(black|white|blue|red|green|pink|grey|gray|silver|gold|svart|hvit|blå|rød|rosa|grå|mini|pro|max|plus|new|202[0-9]|wireless|trådløs|portable|foldable|magnetic)\b/gi,
      " "
    )
    .replace(/[^a-z0-9æøå]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 4)
    .join("-");
  return normalized ? `title:${normalized}` : `id-fallback`;
}

/** Fingerprint first usable image URL path (ignore query) for dedupe. */
export function imageFingerprint(
  images: string | string[] | null | undefined
): string | null {
  const url = pickCleanestImage(images);
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.toLowerCase();
  } catch {
    return url.split("?")[0].toLowerCase();
  }
}

/**
 * Higher = more premium / storefront-worthy.
 */
export function premiumScore(p: CuratableProduct): number {
  let score = 0;
  const blob = normalizeMatchText(curationTextBlob(p));
  const q = p.qualityScore ?? 0;
  const imgs = parseImageUrls(p.images);
  const clean = pickCleanestImage(p.images);

  score += Math.min(q, 100) * 0.55;
  score += Math.min(imgs.length, 6) * 6;
  if (clean) score += 18;
  else score -= 40;

  if (p.category && PREFERRED_CATEGORIES.has(p.category)) score += 22;
  else if (p.category) score += 4;

  // Prefer mid/high ticket over impulse junk — but not industrial tools
  if (p.price >= 299 && p.price <= 2500) score += 18;
  else if (p.price >= 149 && p.price < 299) score += 10;
  else if (p.price < 99) score -= 18;
  else if (p.price > 4000) score -= 4;

  for (const rule of CURATION_SCORE_PENALTIES) {
    if (rule.pattern.test(blob)) score += rule.penalty;
  }

  if (LOW_PREMIUM_PATTERNS.some((re) => re.test(blob))) score -= 35;
  if (CAR_ACCESSORY_SOFT.test(blob)) score -= 28;
  if (/[\u4e00-\u9fff]/.test(p.name)) score -= 40;
  if (isFrontpageExcluded(p)) score -= 200;

  // Cheap USB/adapter spam
  if (
    p.price < 149 &&
    /\b(usb|otg|adapter|dongle|splitter|converter)\b/.test(blob) &&
    !/\b(hub|dock|ssd|charger|lader|keyboard|mouse|speaker|headset)\b/.test(
      blob
    )
  ) {
    score -= 22;
  }

  return score;
}

export type DiversifyOptions = {
  limit: number;
  /** Already claimed product IDs (cross-section). */
  usedIds?: Set<string>;
  /** Min premium score to include (soft — ignored if pool too thin). */
  minPremiumScore?: number;
  /** Prefer quality over filling every slot. */
  allowFewer?: boolean;
  /** Keep pool order (e.g. newest / deals) instead of re-sorting by premium. */
  preserveInputOrder?: boolean;
};

/**
 * Pick a diversified, premium-first slice:
 * - no frontpage-excluded
 * - max one per product family
 * - max one identical image fingerprint
 * - sorted by premiumScore (unless preserveInputOrder)
 */
export function diversifyProducts<T extends CuratableProduct>(
  pool: T[],
  opts: DiversifyOptions
): T[] {
  const usedIds = opts.usedIds ?? new Set<string>();
  const minScore = opts.minPremiumScore ?? 20;
  const allowFewer = opts.allowFewer !== false;

  const filtered = pool
    .filter((p) => !usedIds.has(p.id))
    .filter((p) => !isFrontpageExcluded(p))
    .filter((p) => hasAcceptableStorefrontImage(p.images))
    .map((p) => ({ p, score: premiumScore(p) }));

  const ranked = opts.preserveInputOrder
    ? filtered
    : [...filtered].sort(
        (a, b) => b.score - a.score || b.p.price - a.p.price
      );

  const strong = ranked.filter((r) => r.score >= minScore);
  const candidates =
    opts.preserveInputOrder || strong.length >= Math.min(3, opts.limit)
      ? opts.preserveInputOrder
        ? ranked.filter(
            (r) => r.score >= Math.min(minScore, 8) || strong.length < 3
          )
        : strong
      : ranked;

  const picked: T[] = [];
  const families = new Set<string>();
  const images = new Set<string>();

  for (const { p } of candidates) {
    if (picked.length >= opts.limit) break;
    const fam = productFamilyKey(p);
    if (families.has(fam)) continue;
    const img = imageFingerprint(p.images);
    if (img && images.has(img)) continue;
    picked.push(p);
    families.add(fam);
    if (img) images.add(img);
    usedIds.add(p.id);
  }

  if (!allowFewer && picked.length < opts.limit) {
    // Still no family/image reuse — only fill if truly unique
    for (const { p } of ranked) {
      if (picked.length >= opts.limit) break;
      if (picked.some((x) => x.id === p.id)) continue;
      const fam = productFamilyKey(p);
      if (families.has(fam)) continue;
      const img = imageFingerprint(p.images);
      if (img && images.has(img)) continue;
      picked.push(p);
      families.add(fam);
      if (img) images.add(img);
      usedIds.add(p.id);
    }
  }

  return picked;
}

/**
 * Rewrite images JSON so the cleanest image is first (for cards / hero).
 */
export function withCuratedPrimaryImage<T extends CuratableProduct>(
  p: T
): T & { imageUrl: string | null; images: string } {
  const urls = parseImageUrls(p.images);
  const best = pickCleanestImage(p.images);
  if (!best) {
    return { ...p, imageUrl: null, images: p.images };
  }
  const rest = urls.filter((u) => u !== best);
  return {
    ...p,
    imageUrl: best,
    images: JSON.stringify([best, ...rest]),
  };
}

/** Complement families: "often bought with" boosts for related products. */
const COMPLEMENT_BY_FAMILY: Record<string, string[]> = {
  charger: ["powerbank", "usb_c_cable", "phone_stand", "phone_case", "magsafe"],
  magsafe: ["powerbank", "usb_c_cable", "phone_stand", "charger", "phone_case"],
  powerbank: ["charger", "usb_c_cable", "magsafe", "phone_case"],
  usb_c_cable: ["charger", "powerbank", "usb_c_hub", "phone_stand"],
  phone_case: ["screen_protector", "charger", "powerbank", "phone_stand"],
  screen_protector: ["phone_case", "charger"],
  phone_stand: ["charger", "magsafe", "usb_c_cable", "powerbank"],
  keyboard: ["mouse", "gaming_mouse", "mouse_pad", "headset", "usb_c_hub"],
  gaming_mouse: ["mouse_pad", "keyboard", "headset", "mouse_bungee"],
  mouse: ["mouse_pad", "keyboard", "usb_c_hub"],
  mouse_pad: ["gaming_mouse", "mouse", "keyboard"],
  headset: ["keyboard", "gaming_mouse", "microphone"],
  speaker: ["usb_c_cable", "usb_c_hub"],
  usb_c_hub: ["usb_c_cable", "ssd", "charger", "keyboard"],
  ssd: ["usb_c_hub", "usb_c_cable"],
  controller: ["headset", "mouse_pad"],
};

export function relatedComplementBoost(
  sourceName: string,
  sourceCategory: string | null | undefined,
  candidateName: string,
  candidateCategory: string | null | undefined
): number {
  const src = matchFamily(sourceName, sourceCategory);
  const cand = matchFamily(candidateName, candidateCategory);
  if (!src || !cand) return 0;
  if (src === cand) return -15; // same family = variant-ish, not complementary
  const comps = COMPLEMENT_BY_FAMILY[src] || [];
  if (comps.includes(cand)) return 35;
  // reverse lookup
  for (const [fam, list] of Object.entries(COMPLEMENT_BY_FAMILY)) {
    if (cand === fam && list.includes(src)) return 28;
  }
  return 0;
}
