/**
 * Product title cleaner for imported products.
 *
 * Turns keyword-stuffed supplier titles into natural, SEO-friendly
 * Norwegian titles (max 60 chars, prefer 45-60).
 *
 * Example:
 *   "3 Stk Full Dekkende Herdet Glass Kameralinsebeskytter Egnet For iPhone"
 *   -> "Full Dekkende Herdet Glass Kameralinsebeskytter – iPhone (3-pk)"
 *
 * Pure module – safe to use on both server and client.
 */

const MAX_TITLE_LENGTH = 60;

/** Acronyms and product terms that should keep their casing. */
const KEEP_CASING = new Set([
  "USB",
  "USB-C",
  "USB-A",
  "HDMI",
  "LED",
  "RGB",
  "TV",
  "PC",
  "SSD",
  "HDD",
  "HD",
  "4K",
  "8K",
  "LCD",
  "OLED",
  "GPS",
  "NFC",
  "RFID",
  "WIFI",
  "BT",
  "AUX",
  "DC",
  "AC",
  "3D",
  "2K",
  "MAH",
  "IP67",
  "IP68",
  "PS5",
  "PS4",
  "XL",
  "XXL",
  "TWS",
  "ANC",
  "QI",
]);

/** Brand names with special casing. */
const BRAND_CASING: Record<string, string> = {
  iphone: "iPhone",
  ipad: "iPad",
  ipod: "iPod",
  imac: "iMac",
  macbook: "MacBook",
  airpods: "AirPods",
  magsafe: "MagSafe",
  playstation: "PlayStation",
  oneplus: "OnePlus",
};

/** Trailing connector words a title should never end with. */
const TRAILING_STOPWORDS = new Set([
  "med",
  "og",
  "i",
  "for",
  "til",
  "av",
  "uten",
  "på",
  "the",
  "with",
  "and",
]);

/** Marketing filler that adds no product information. */
const FILLER_PATTERNS: RegExp[] = [
  /\bhot\s*sale\b/gi,
  /\bgratis\s+frakt\b/gi,
  /\bfree\s+shipping\b/gi,
  /\bh[øo]y\s*kvalitets?\b/gi,
  /\bhigh\s+quality\b/gi,
  /\btop\s+quality\b/gi,
  /\bkvalitets?sikret\b/gi,
  /\bluksus\b/gi,
  /\bluxury\b/gi,
  /\bfashion\b/gi,
  /\bmote(riktig)?\b/gi,
  /\bnyankomst\b/gi,
  /\bnew\s+arrival\b/gi,
  /\bbestselger\b/gi,
  /\bbest\s*seller\b/gi,
  /\b(nyeste|helt\s+ny)\b/gi,
  /\b20(2[0-9])\s*(ny|modell|nyhet)?\b/gi,
  /\bp[åa]\s+lager\b/gi,
  /\btilbud\b/gi,
  /\bsalg\b/gi,
  /\brabatt\b/gi,
  /\bbillig(ste)?\b/gi,
  /\bcheap(est)?\b/gi,
  /\buts[øo]kt\b/gi,
  /\bexquisite\b/gi,
  /\bdurable\b/gi,
  /\bcreative\b/gi,
  /\bkreativ\b/gi,
  /\b1\s*(stk|pc|pcs)\b/gi,
];

/** Brands/devices used to detect a compatibility segment. */
const DEVICE_PATTERN =
  /\b(iphone|ipad|ipod|airpods|apple\s*watch|macbook|samsung(?:\s+galaxy)?|galaxy|huawei|xiaomi|oneplus|oppo|motorola|nokia|sony(?:\s+xperia)?|google\s*pixel|pixel|ps5|ps4|playstation|xbox|nintendo\s*switch|switch)\b/i;

export interface TitleParts {
  base: string;
  compatibility: string | null;
  packCount: number | null;
}

function stripEmojis(text: string): string {
  return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "");
}

/** Extract pack count ("3 stk", "3-pack", "3pk", "pakke med 3"). */
export function extractPackCount(title: string): { cleaned: string; packCount: number | null } {
  let packCount: number | null = null;
  let cleaned = title;

  const patterns = [
    /\b(\d+)\s*[- ]?\s*(?:stk|stykker?|pk|pakk?e?|pack|pcs|pieces|deler)\b\.?/gi,
    /\bpakke\s+med\s+(\d+)\b/gi,
    /\b(\d+)\s*x\b(?!\s*\d)/gi,
    /\[(\d+)[- ]?(?:pack|pk|stk)\]/gi,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(cleaned);
    if (match) {
      const count = parseInt(match[1], 10);
      if (count > 1 && count <= 100) {
        packCount = count;
        cleaned = cleaned.replace(pattern, " ");
        break;
      }
    }
  }

  return { cleaned: cleaned.replace(/\s+/g, " ").trim(), packCount };
}

/**
 * Extract a compatibility segment ("Egnet for iPhone 15/16", "for Samsung
 * Galaxy S24"). Removes the phrase from the title and returns the device part.
 */
export function extractCompatibility(title: string): {
  cleaned: string;
  compatibility: string | null;
} {
  const connectorPattern =
    /\b(?:egnet\s+(?:for|til)|kompatibel\s+med|passer\s+(?:til|for)|tilpasset|compatible\s+with|designet\s+for|laget\s+for|for|til)\s+((?:for\s+)?(?:iphone|ipad|ipod|airpods|apple\s*watch|macbook|samsung(?:\s+galaxy)?|galaxy|huawei|xiaomi|oneplus|oppo|motorola|nokia|sony(?:\s+xperia)?|google\s*pixel|pixel|ps5|ps4|playstation|xbox|nintendo\s*switch|switch)[\wæøå\s\/+.,-]*)/i;

  const match = title.match(connectorPattern);
  if (!match) {
    return { cleaned: title, compatibility: null };
  }

  let device = match[1]
    .replace(/\bfor\s+/gi, "")
    .replace(/[,.]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  // Cut trailing non-model words (keep brand + model tokens + separators)
  const deviceWords = device.split(" ");
  const kept: string[] = [];
  for (const word of deviceWords) {
    if (
      DEVICE_PATTERN.test(word) ||
      /^[\d\/+.-]+$/.test(word) ||
      /^(pro|max|plus|mini|ultra|air|se|fe|lite|serie[ns]?|galaxy|watch|s\d+|a\d+|note)\b/i.test(
        word
      )
    ) {
      kept.push(word);
    } else {
      break;
    }
  }
  device = kept.join(" ").trim() || device;

  // Join consecutive model numbers with "/" and keep at most two
  // ("iPhone 16 15 14 13" -> "iPhone 16/15") to save title space
  device = device.replace(/(\d+)((?:\s+\d+)+)/g, (_, first: string, rest: string) => {
    const others = rest.trim().split(/\s+/).slice(0, 1);
    return [first, ...others].join("/");
  });

  const cleaned = title.replace(match[0], " ").replace(/\s+/g, " ").trim();
  return { cleaned, compatibility: device || null };
}

/** Remove duplicate words while preserving order (case-insensitive). */
function dedupeWords(text: string): string {
  const seen = new Set<string>();
  let previousKey = "";
  return text
    .split(" ")
    .filter((word) => {
      const key = word.toLowerCase().replace(/[^\wæøå/+-]/g, "");
      if (!key) return true;
      // Consecutive duplicates are always removed ("Lys Lys")
      if (key === previousKey) return false;
      previousKey = key;
      // Allow short connector words to repeat ("i", "med", "for", "og")
      if (key.length <= 3 && !/^\d/.test(key)) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" ");
}

/** Normalize word casing: fix ALL CAPS, keep acronyms/brands, capitalize first. */
function normalizeCasing(text: string): string {
  const normalized = text
    .split(" ")
    .map((word) => {
      const bare = word.replace(/[^\wæøå-]/gi, "");
      const brand = BRAND_CASING[bare.toLowerCase()];
      if (brand) {
        return word.replace(bare, brand);
      }
      if (KEEP_CASING.has(bare.toUpperCase())) {
        return word.replace(bare, bare.toUpperCase());
      }
      if (word === word.toUpperCase() && word.length > 2 && !/\d/.test(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(" ");

  // Capitalize first letter unless the first word has fixed casing (iPhone)
  const firstBare = normalized.split(" ")[0]?.replace(/[^\wæøå-]/gi, "") || "";
  if (BRAND_CASING[firstBare.toLowerCase()]) {
    return normalized;
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/** Truncate at a word boundary. */
function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : text.slice(0, maxLength)).trim();
}

/** Remove trailing connector words a title should not end with. */
function stripTrailingStopwords(text: string): string {
  const words = text.split(" ");
  while (words.length > 1 && TRAILING_STOPWORDS.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  return words.join(" ");
}

/**
 * Shorten the base text to fit. In stuffed supplier titles the head noun
 * usually comes LAST ("... Herdet Glass Kameralinsebeskytter"), so when a
 * suffix exists we drop adjectives from the front instead of cutting the
 * product noun at the end.
 */
function shortenBase(base: string, maxLength: number, hasSuffix: boolean): string {
  if (base.length <= maxLength) return stripTrailingStopwords(base);

  if (hasSuffix) {
    const words = base.split(" ");
    while (words.join(" ").length > maxLength && words.length > 2) {
      words.shift();
    }
    let result = words.join(" ");
    if (result.length > maxLength) {
      result = truncateAtWord(result, maxLength);
    }
    return stripTrailingStopwords(result);
  }

  return stripTrailingStopwords(truncateAtWord(base, maxLength));
}

/** Split a raw supplier title into structured parts. */
export function parseTitleParts(rawTitle: string): TitleParts {
  let working = stripEmojis(rawTitle).replace(/\s+/g, " ").trim();

  for (const pattern of FILLER_PATTERNS) {
    working = working.replace(pattern, " ");
  }
  working = working.replace(/\s+/g, " ").trim();

  const packResult = extractPackCount(working);
  const compatResult = extractCompatibility(packResult.cleaned);

  let base = compatResult.cleaned
    .replace(/[,;|]+/g, " ")
    .replace(/\s*-\s*$/g, "")
    .replace(/^\s*-\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  base = dedupeWords(base);

  return {
    base,
    compatibility: compatResult.compatibility,
    packCount: packResult.packCount,
  };
}

/**
 * Assemble a clean title from parts, respecting the 60 char limit.
 * Suffixes (compatibility, pack count) are prioritized – the base
 * text is shortened first if needed.
 */
export function assembleTitle(parts: TitleParts): string {
  const packSuffix = parts.packCount ? ` (${parts.packCount}-pk)` : "";
  const compatSuffix = parts.compatibility ? ` – ${normalizeCasing(parts.compatibility)}` : "";

  const suffix = `${compatSuffix}${packSuffix}`;
  const baseMax = Math.max(20, MAX_TITLE_LENGTH - suffix.length);

  let base = normalizeCasing(parts.base);
  base = shortenBase(base, baseMax, suffix.length > 0);

  const title = `${base}${suffix}`;
  return title.length <= MAX_TITLE_LENGTH ? title : truncateAtWord(title, MAX_TITLE_LENGTH);
}

/**
 * Clean a raw supplier product title into a natural Norwegian title.
 * Max 60 characters, no keyword stuffing, no "Egnet for", no filler.
 */
export function cleanProductTitle(rawTitle: string): string {
  if (!rawTitle || !rawTitle.trim()) return "Produkt";

  const parts = parseTitleParts(rawTitle);
  if (!parts.base && !parts.compatibility) {
    return "Produkt";
  }
  if (!parts.base) {
    parts.base = parts.compatibility as string;
    parts.compatibility = null;
  }

  const result = assembleTitle(parts);
  return result || "Produkt";
}
