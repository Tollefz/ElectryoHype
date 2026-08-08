/**
 * Senior Merchandiser — full catalog pass helpers.
 * Judgment + rules (not feature UI). Used by scripts/merchandiser-full-catalog-pass.ts
 */

import { isStoreDnaBlocked, detectStoreDnaAbsoluteReject } from "@/lib/buyer/store-dna-policy";
import { looksLikeEnglishTitle } from "@/lib/import/norwegian-title";
import { cleanProductName } from "@/lib/utils/url-decode";

export type MerchProduct = {
  id: string;
  name: string;
  slug: string;
  metaTitle: string | null;
  metaDescription: string | null;
  shortDescription: string | null;
  description: string | null;
  category: string | null;
  price: number;
  compareAtPrice: number | null;
  images: string;
  specs: unknown;
  tags: string;
  supplierPrice: number | null;
};

/** Soft off-assortment / AliExpress-random feel — merchandiser judgment beyond absolute DNA. */
const SOFT_REJECT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern:
      /\b(pantry|cabinet|wardrobe|bookshelf|sofa|couch|mattress|bedding|curtain|rug\b|carpet|pillow|duvet)\b/i,
    reason: "Møbler / hjemmetekstil — ikke elektronikkbutikk",
  },
  {
    pattern: /\b(fishing|camping tent|sleeping bag|bbq|grill\b|garden hose|lawn)\b/i,
    reason: "Utendørs / hage — utenfor sortiment",
  },
  {
    pattern: /\b(sex\s*toy|vibrator|dildo|anal\b|bondage|erotic)\b/i,
    reason: "Voksenprodukt",
  },
  {
    pattern: /\b(piano\s*bench|music\s*stand|violin|guitar\s*strap|drum\s*kit)\b/i,
    reason: "Musikkinstrument / tilbehør",
  },
  {
    pattern: /\b(nail\s*gel|eyelash|wig\b|hair\s*extension)\b/i,
    reason: "Beauty utenfor sortiment",
  },
  {
    pattern: /\b(pet\s*feeder|litter\s*box|aquarium\s*filter|cat\s*toy|dog\s*toy|for\s*(indoor\s*)?cats?\b)\b/i,
    reason: "Kjæledyr",
  },
  {
    pattern: /\b(flying\s*squirrel|page\s*turning\s*pen|laser\s*pointer\s*teaching)\b/i,
    reason: "Undervisningsgadget / utenfor sortiment",
  },
  {
    pattern: /\b(horse\s*racing\s*mouse|streamer\s*horse)\b/i,
    reason: "AliExpress-tilfeldig / uforståelig produkt",
  },
  {
    pattern: /\b(treasure|factory\s*direct|wholesale\s*lot|dropship\s*sample)\b/i,
    reason: "Wholesale / AliExpress-tilfeldig språk",
  },
  {
    pattern: /\b(jumper|jump\s*start|booster\s*pack|peak\s*\d{3,}\s*a)\b/i,
    reason: "Bilbooster / startkabel-kit",
  },
  {
    pattern: /\b(washing\s*machine|dishwasher|refrigerator|fridge|freezer|oven\b)\b/i,
    reason: "Store hvitevarer — ikke vårt fokus",
  },
  {
    pattern:
      /\b(eat\s*chicken\s*artifact|children\s*can\s*practice|37[- ]?key\s*electronic|mini\s*flip\s*phone|handskit\s*screwdriver|screw\s*driver\s*set\s*multifunctional|beginner\s*children|kids\s*piano|electronic\s*organ|fpv\s*mini|uvc\s*video\s*downlink|chicken\s*noise\s*reduction|honeycomb\s*shell|ceiling\s*usb\s*electric|leather\s*surface\s*trådløs|restaurant\s*pager|key\s*storage\s*box|hand\s*warmer|unlocked\s*smartphone|ornaments\s*cat|l[- ]?shaped\s*corner\s*computer\s*desk|wide\s*worktop)\b/i,
    reason: "AliExpress-tilfeldig / utenfor premium-sortiment",
  },
];

const GENERIC_DESC =
  /pålitelig lading med stabil strømforsyning|best quality|factory direct|high quality product|plastpose|perfect for home and office|buy now|limited stock/i;

export function merchHaystack(p: MerchProduct): string {
  return [p.name, p.metaTitle, p.shortDescription, p.description, p.category, p.tags]
    .filter(Boolean)
    .join(" ");
}

export function decideUnpublish(p: MerchProduct): { unpublish: boolean; reason: string } | null {
  const hay = merchHaystack(p);
  const abs = detectStoreDnaAbsoluteReject(hay);
  if (abs || isStoreDnaBlocked(hay)) {
    return { unpublish: true, reason: abs || "Store DNA absoluttreject" };
  }
  for (const s of SOFT_REJECT_PATTERNS) {
    if (s.pattern.test(hay)) {
      return { unpublish: true, reason: s.reason };
    }
  }
  // Extreme junk title
  if (/^[\d\s\W]{0,3}$/.test((p.name || "").trim()) || (p.name || "").length < 4) {
    return { unpublish: true, reason: "Ubrukelig tittel" };
  }
  return null;
}

/** Suggest store category from title/tags — allowlist only. */
export function suggestCategory(p: MerchProduct): string | null {
  // Prefer product name over noisy tags for classification
  const t = `${p.name} ${p.metaTitle || ""} ${p.shortDescription || ""}`.toLowerCase();
  const current = p.category;
  const pick = (cat: string) => (current === cat ? null : cat);

  // Specific accessories first (avoid RGB/gaming keywords stealing chargers)
  if (
    /\b(qi\b|wireless\s*charg|power\s*bank|powerbank|magsafe|car\s*mount|phone\s*(case|holder)|lightning\s*cable|iphone|airpods)\b/i.test(
      t
    )
  ) {
    return pick("Mobil & Tilbehør");
  }
  if (
    /\b(usb[- ]?c\s*hub|docking|laptop\s*stand|ssd\b|wifi\s*adapter|network\s*card|ethernet|nvme|webcam)\b/i.test(
      t
    )
  ) {
    return pick("Data & IT");
  }
  if (
    /\b(hdmi|soundbar|projector|earbud|earphone|headphone|høyttaler|speaker|microphone|mic\b|tv\s*box)\b/i.test(
      t
    )
  ) {
    return pick("TV, Lyd & Bilde");
  }
  if (
    /\b(gaming\s*(mouse|mus|keyboard|tastatur|headset|chair)|mekanisk\s*tastatur|rgb\s*(mouse|mus)|gamepad|joystick|controller)\b/i.test(
      t
    )
  ) {
    return pick("Gaming");
  }
  if (/\b(led\s*strip|desk\s*lamp|smart\s*plug|smart\s*bulb|cable\s*management)\b/i.test(t)) {
    return pick("Hjem & Fritid");
  }
  // Broader fallbacks
  if (/\b(mouse|mus\b|keyboard|tastatur)\b/i.test(t) && /\bgaming|rgb|mekanisk\b/i.test(t)) {
    return pick("Gaming");
  }
  if (/\b(mouse|mus\b|keyboard|tastatur|hub|dock)\b/i.test(t)) {
    return pick("Data & IT");
  }
  return null;
}

export function parseImages(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === "string" && u.startsWith("http")) : [];
  } catch {
    return raw?.startsWith("http") ? [raw] : [];
  }
}

export function imageIssues(images: string[]): string[] {
  const issues: string[] = [];
  if (images.length === 0) issues.push("mangler_bilder");
  for (const url of images.slice(0, 3)) {
    if (/aliexpress|alicdn\.com\/kf\/|temu\.com/i.test(url)) issues.push("markedsplass_cdn");
    if (/\.gif(\?|$)/i.test(url)) issues.push("gif");
  }
  return [...new Set(issues)];
}

export function priceAnomaly(p: MerchProduct): string | null {
  if (p.price <= 0) return "pris_null";
  if (p.price > 15000) return "ekstrem_høy_pris";
  if (p.supplierPrice != null && p.supplierPrice > 0) {
    const markup = p.price / p.supplierPrice;
    if (markup > 8) return "ekstrem_overprising";
    if (markup < 1.15) return "under_kost_eller_lav_margin";
  }
  if (p.compareAtPrice != null && p.compareAtPrice > 0) {
    const disc = 1 - p.price / p.compareAtPrice;
    if (disc > 0.55) return "urealistisk_rabatt";
    if (p.compareAtPrice < p.price) return "compare_lavere_enn_pris";
  }
  return null;
}

/**
 * Rule-based Norwegian retail title — natural, not word-for-word.
 * Max ~60 chars preferred.
 */
export function norwegianRetailTitle(rawName: string): string {
  let t = cleanProductName(rawName || "").trim();
  if (!t) return t;

  // Strip marketplace / wholesale noise
  t = t
    .replace(/\b(compatible\s+with|compatible)\b/gi, "")
    .replace(/\b(for\s+iphone|for\s+apple|for\s+samsung|for\s+11\s*pro\s*xs?)\b/gi, "")
    .replace(/\b(new\s+upgrade|new\s+arrival|hot\s+sale|best\s+seller|factory\s+direct)\b/gi, "")
    .replace(/\b(temu|alibaba|cj\s*dropshipping|wholesale)\b/gi, "")
    .replace(/[|].*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  const lower = t.toLowerCase();

  // Phrase-level rewrites (order matters — more specific first)
  const phrases: Array<[RegExp, string]> = [
    [/\bultra[- ]?thin\s+wireless\s+fast\s+charging\b/i, "Ultratynn trådløs hurtiglader"],
    [/\bsilent\s+charg(ing|er)?\s+rgb\b/i, "Stille RGB-gamingmus"],
    [/\bcat\s*ear\s*(gaming\s*)?(headphone|headset)\b/i, "Cat-ear gaming-headset"],
    [/\btempered\s+glass\s+laptop\b/i, "Laptopstativ i herdet glass"],
    [/\besports\s+tournament\s+gaming\b/i, "Gaming-laptopstativ"],
    [/\bfelt\s+desk\s+pad\b/i, "Filt skrivebordsmatte"],
    [/\bdesk\s+pad\b/i, "Skrivebordsmatte"],
    [/\bmouse\s+pad\b/i, "Musematte"],
    [/\bluminous\s+electric\b/i, "RGB-mus"],
    [/\bearphone\s+in[- ]?ear\b/i, "In-ear ørepropper"],
    [/\bbluetooth\s+earphone\b/i, "Bluetooth-ørepropper"],
    [/\bwireless\s+pro\s+charger\b/i, "Trådløs Pro-lader"],
    [/\bqi\s+wireless\s+charger\b/i, "Trådløs Qi-lader"],
    [/\bwireless\s+charger\s*stand\b/i, "Trådløs ladestativ"],
    [/\bwireless\s+charging\s*pad\b/i, "Trådløs ladeplate"],
    [/\bcar\s+qi\s+wireless\s+charger\b/i, "Trådløs billader"],
    [/\bcar\s+wireless\s+charger\b/i, "Trådløs billader"],
    [/\bfolding\s+wireless\s+charger\b/i, "Sammenleggbar trådløs lader"],
    [/\bwireless\s+charger\b/i, "Trådløs lader"],
    [/\bpower\s*bank\b/i, "Powerbank"],
    [/\bdocking\s+station\b/i, "Dokkingstasjon"],
    [/\busb[- ]?c\s+hub\b/i, "USB-C-hub"],
    [/\btype[- ]?c\s+docking\b/i, "USB-C dokkingstasjon"],
    [/\blaptop\s+stand\b/i, "Laptopstativ"],
    [/\bmonitor\s+(mount|stand|arm|bracket)\b/i, "Skjermfeste"],
    [/\bmechanical\s+keyboard\b/i, "Mekanisk tastatur"],
    [/\bgaming\s+keyboard\b/i, "Gaming-tastatur"],
    [/\bgaming\s+mouse\b/i, "Gaming-mus"],
    [/\bgaming\s+headset\b/i, "Gaming-headset"],
    [/\bwireless\s+mouse\b/i, "Trådløs mus"],
    [/\bwireless\s+keyboard\b/i, "Trådløst tastatur"],
    [/\bled\s+strip\b/i, "LED-list"],
    [/\bhdmi\s+cable\b/i, "HDMI-kabel"],
    [/\busb[- ]?c\s+cable\b/i, "USB-C-kabel"],
    [/\bfast\s+charg(er|ing)\b/i, "Hurtiglader"],
    [/\bphone\s+holder\b/i, "Telefonholder"],
    [/\bcar\s+mount\b/i, "Bilholder til telefon"],
    [/\bwifi\s+(adapter|receiver|dongle)\b/i, "WiFi-adapter"],
    [/\bnetwork\s+card\b/i, "Nettverkskort"],
    [/\bearbuds?\b/i, "Ørepropper"],
    [/\bheadphones?\b/i, "Hodetelefoner"],
    [/\bspeaker\b/i, "Høyttaler"],
    [/\bwebcam\b/i, "Webkamera"],
  ];

  for (const [re, no] of phrases) {
    if (re.test(t)) {
      // Keep capacity / wattage hints
      const mah = t.match(/(\d+)\s*mAh/i);
      const watt = t.match(/(\d+)\s*W\b/i);
      const ports = t.match(/(\d+)[- ]?in[- ]?1/i);
      let out = no;
      if (ports) out = `${ports[1]}-i-1 ${out}`;
      if (watt && !/lader|hub|dokking/i.test(out)) out = `${watt[1]}W ${out}`;
      if (mah) out = `${out} ${mah[1]} mAh`;
      return truncateTitle(capitalizeNo(out));
    }
  }

  // Word-level glossary
  const map: Record<string, string> = {
    wireless: "trådløs",
    charger: "lader",
    charging: "lading",
    portable: "bærbar",
    bluetooth: "Bluetooth",
    keyboard: "tastatur",
    mouse: "mus",
    cable: "kabel",
    adapter: "adapter",
    holder: "holder",
    stand: "stativ",
    mount: "feste",
    case: "deksel",
    cover: "deksel",
    screen: "skjerm",
    protector: "beskyttelse",
    magnetic: "magnetisk",
    folding: "sammenleggbar",
    adjustable: "justerbar",
    universal: "universell",
    desktop: "skrivebord",
    laptop: "laptop",
    tablet: "nettbrett",
    smart: "smart",
    led: "LED",
    rgb: "RGB",
    hub: "hub",
    dock: "dokk",
    station: "stasjon",
    fast: "rask",
    ultra: "ultra",
    thin: "tynn",
    new: "",
    round: "rund",
    fabric: "stoff",
    aluminum: "aluminium",
    alloy: "legering",
    standard: "",
    support: "støtte",
    with: "med",
    for: "til",
    and: "og",
    the: "",
    of: "",
    to: "til",
    in: "i",
    multi: "multi",
    port: "port",
    expansion: "utvidelse",
  };

  if (looksLikeEnglishTitle(t)) {
    const words = t.split(/\s+/).map((w) => {
      const key = w.toLowerCase().replace(/[^a-z0-9+%-]/gi, "");
      if (!key) return "";
      if (/^\d/.test(key) || /^(usb|hdmi|qi|ssd|nvme|type-?c|magsafe)$/i.test(key)) return w;
      return map[key] !== undefined ? map[key] : w;
    });
    t = words.filter(Boolean).join(" ");
  }

  // Forced clean titles for hybrid EN/NO leftovers
  if (/\b(tastatur|keyboard|keypad)\b/i.test(t)) {
    if (/sammenlegg|foldable|mini/i.test(t) && /bluetooth|trådløs|wireless/i.test(t)) {
      return "Sammenleggbart Bluetooth-tastatur";
    }
    if (/mekanisk|mechanical|pbt|keycaps/i.test(t)) {
      return "Mekanisk tastatur";
    }
    if (/gaming|rgb/i.test(t)) return "Gaming-tastatur";
    if (/bluetooth|trådløs|wireless/i.test(t)) return "Trådløst Bluetooth-tastatur";
    return "Tastatur";
  }
  if (/\b(mus|mouse)\b/i.test(t) && !/mouse\s*pad|musematte/i.test(t)) {
    if (/gaming|rgb|e-sports|esport/i.test(t)) return "Gaming-mus";
    if (/bluetooth|trådløs|wireless|silent|stille/i.test(t)) return "Trådløs mus";
    return "Datamus";
  }
  if (/\b(headset|ørepropper|earbud|earphone|headphone)\b/i.test(t)) {
    if (/gaming|low-latency|tws|noise/i.test(t)) return "Trådløst gaming-headset";
    if (/bluetooth|trådløs|sports/i.test(t)) return "Trådløst headset";
    return "Headset";
  }
  if (/skrivebord|desktop|bracket|monitor|feste|stativ/i.test(t) && /juster|adjust|universal/i.test(t)) {
    return "Justerbart skjermfeste";
  }
  if (/musematte|mouse\s*pad|desk\s*pad/i.test(t)) {
    if (/rgb|gaming/i.test(t)) return "RGB musematte";
    return "Musematte";
  }

  return truncateTitle(capitalizeNo(t.replace(/\s+/g, " ").trim()));
}

function capitalizeNo(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncateTitle(s: string, max = 58): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > 20 ? cut.slice(0, sp) : cut).trim();
}

export function norwegianShortDescription(p: MerchProduct, title: string): string {
  const existing = (p.shortDescription || "").trim();
  if (existing && !GENERIC_DESC.test(existing) && !looksLikeEnglishTitle(existing) && existing.length >= 40) {
    return existing.slice(0, 160);
  }

  const cat = p.category || "Elektronikk";
  const base = title || cleanProductName(p.name);
  const templates: Record<string, string> = {
    "Mobil & Tilbehør": `${base} — praktisk tilbehør til mobil og hverdagsbruk. Stabil ytelse og enkel i bruk.`,
    Gaming: `${base} — for gaming og setup. God følelse, tydelig design og klar til bruk.`,
    "Data & IT": `${base} — nyttig for PC, laptop og kontor. Enkel tilkobling og ryddig hverdag.`,
    "TV, Lyd & Bilde": `${base} — for bedre bilde og lyd hjemme. Enkel installasjon og solid kvalitet.`,
    "Hjem & Fritid": `${base} — smart tilbehør til hjemmekontor og fritid. Praktisk og gjennomtenkt.`,
  };
  return (templates[cat] || `${base} — kvalitetsprodukt fra ElectroHypeX. Klar til bruk.`).slice(0, 160);
}

export function needsDescriptionRewrite(p: MerchProduct): boolean {
  const s = `${p.shortDescription || ""} ${p.description || ""}`;
  if (!s.trim()) return true;
  if (GENERIC_DESC.test(s)) return true;
  if (/best quality|factory direct|high quality|wholesale/i.test(s)) return true;
  if (/emballasje:\s*plastpose/i.test(s)) return true;
  return false;
}

export function cleanSpecs(specs: unknown): Record<string, string> | null {
  if (!specs || typeof specs !== "object" || Array.isArray(specs)) return null;
  const out: Record<string, string> = {};
  const dropKey = /category|subcategory|package|emballasje|sku|id\b/i;
  const dropVal = /plastpose|plastic\s*bag|n\/a|null|undefined|best quality/i;
  const unitFix: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^(metal)$/i, () => "Metall"],
    [/^(plastic)$/i, () => "Plast"],
    [/^(\d+(?:\.\d+)?)\s*$/i, (m) => m[1]],
  ];

  for (const [k, v] of Object.entries(specs as Record<string, unknown>)) {
    if (dropKey.test(k)) continue;
    let val = String(v ?? "").trim();
    if (!val || dropVal.test(val)) continue;
    if (/^home office/i.test(val)) continue;
    for (const [re, fn] of unitFix) {
      const m = val.match(re);
      if (m) {
        val = fn(m);
        break;
      }
    }
    // Weight without unit
    if (/vekt|weight/i.test(k) && /^\d+(\.\d+)?$/.test(val)) {
      val = `${val} g`;
    }
    out[k] = val;
  }
  return Object.keys(out).length ? out : null;
}

export function buildMetaTitle(title: string): string {
  const base = title.replace(/\s*[|–-]\s*ElectroHypeX.*$/i, "").trim();
  const withBrand = `${base} | ElectroHypeX`;
  return withBrand.length <= 65 ? withBrand : `${base.slice(0, 48).trim()} | ElectroHypeX`;
}

export function buildMetaDescription(title: string, short: string): string {
  const s = (short || title).replace(/\s+/g, " ").trim();
  const line = `${s} Fri frakt over 500 kr. Levering 5–12 virkedager.`;
  return line.slice(0, 155);
}
