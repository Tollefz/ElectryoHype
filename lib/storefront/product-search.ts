/**
 * Storefront product search — relevance ranking over existing catalog metadata.
 *
 * Replaces naive `name contains query` with:
 * - tokenization + Norwegian compound joins (mus matte → musematte)
 * - synonym expansion (deksel↔case, tastatur↔keyboard, …)
 * - multi-field match (name, subcategory, category, tags, SEO, shortDescription)
 * - intent-aware boosts/penalties (phone case vs keyboard dust cover, PC vs controller)
 * - AND-preferring multi-term scoring (all tokens → rank first)
 *
 * No UI changes — consumed by /products?q=
 */

export type SearchableProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  images: string;
  category: string | null;
  subcategory: string | null;
  tags: string;
  metaTitle: string | null;
  shortDescription: string | null;
  isActive: boolean;
};

export type ScoredProduct<T extends SearchableProduct = SearchableProduct> = T & {
  searchScore: number;
};

type SearchIntent =
  | "phone_case"
  | "tablet_case"
  | "mouse_pad"
  | "keyboard"
  | "mouse"
  | "pc"
  | "headset"
  | "charger"
  | "cable"
  | "generic";

/** Synonym groups — query token expands to all members of its group. */
const SYNONYM_GROUPS: string[][] = [
  [
    "deksel",
    "case",
    "cover",
    "etui",
    "mobildeksel",
    "phonecase",
    "phone case",
    "bumper",
  ],
  [
    "musematte",
    "musmatte",
    "mousepad",
    "mouse pad",
    "deskmat",
    "desk mat",
    "deskpad",
    "desk pad",
  ],
  ["tastatur", "keyboard"],
  ["mus", "mouse", "gamingmus", "gaming mus", "spillmus"],
  [
    "pc",
    "computer",
    "datamaskin",
    "desktop",
    "stasjonær",
    "stasjonar",
    "minipc",
    "mini pc",
  ],
  ["laptop", "notebook", "bærbar", "baerbar"],
  ["nettbrett", "tablet", "ipad"],
  ["iphone", "apple iphone"],
  ["samsung", "galaxy"],
  [
    "headset",
    "hodetelefon",
    "hodetelefoner",
    "øretelefon",
    "oretelefon",
    "earbuds",
    "ørepropper",
    "orepropper",
  ],
  ["lader", "charger", "hurtiglader", "vegglader", "oplader"],
  ["powerbank", "nødlader", "nodlader", "portable charger"],
  ["kabel", "cable", "ladekabel"],
  ["kontroller", "controller", "gamepad", "joypad"],
  ["mikrofon", "microphone", "mic"],
  ["høyttaler", "hoyttaler", "speaker", "bluetooth speaker"],
  [
    "skjermbeskytter",
    "screen protector",
    "herdet glass",
    "tempered glass",
  ],
  ["dokkingstasjon", "docking", "dock", "hub"],
  ["usb", "usb c", "usbc", "usb-c", "type c", "typec"],
  ["webkamera", "webcam", "web cam"],
  ["telefonholder", "mobilholder", "phone holder", "phone stand"],
  ["spill", "gaming", "gamer"],
];

/** One-way query rewrites applied before tokenization. */
const QUERY_REWRITES: Array<{ from: RegExp; to: string }> = [
  { from: /\busbc\b/gi, to: "usb c" },
  { from: /\busb-c\b/gi, to: "usb c" },
  { from: /\boplader\b/gi, to: "lader" },
  { from: /\bwebcam\b/gi, to: "webkamera" },
  { from: /\bmusmatte\b/gi, to: "musematte" },
  { from: /\bmousepad\b/gi, to: "musematte" },
  { from: /\bmouse\s*pad\b/gi, to: "musematte" },
  { from: /\bearbuds\b/gi, to: "ørepropper" },
  { from: /\bcharger\b/gi, to: "lader" },
];

/**
 * Glued Norwegian/EN compounds → split tokens (spilltastatur → spill + tastatur).
 * Longest match first.
 */
const COMPOUND_SPLITS: Array<{ glued: string; parts: string[] }> = [
  { glued: "spilltastatur", parts: ["spill", "tastatur"] },
  { glued: "gamingtastatur", parts: ["gaming", "tastatur"] },
  { glued: "gamingkeyboard", parts: ["gaming", "keyboard"] },
  { glued: "mobilholder", parts: ["mobil", "holder"] },
  { glued: "telefonholder", parts: ["telefon", "holder"] },
  { glued: "mobildeksel", parts: ["mobil", "deksel"] },
  { glued: "skjermbeskytter", parts: ["skjerm", "beskytter"] },
  { glued: "ladekabel", parts: ["lade", "kabel"] },
  { glued: "musematte", parts: ["musematte"] }, // keep as one — already a product noun
  { glued: "musmatte", parts: ["musematte"] },
  { glued: "mousepad", parts: ["musematte"] },
];

/** Adjacent query tokens that form a single product-type term. */
const COMPOUND_JOINS: Array<{ parts: string[]; joined: string }> = [
  { parts: ["mus", "matte"], joined: "musematte" },
  { parts: ["mouse", "pad"], joined: "mousepad" },
  { parts: ["mouse", "matte"], joined: "musematte" },
  { parts: ["desk", "mat"], joined: "deskmat" },
  { parts: ["desk", "pad"], joined: "deskpad" },
  { parts: ["phone", "case"], joined: "phonecase" },
  { parts: ["gaming", "pc"], joined: "gamingpc" },
  { parts: ["mini", "pc"], joined: "minipc" },
  { parts: ["tablet", "pc"], joined: "tabletpc" },
  { parts: ["screen", "protector"], joined: "screenprotector" },
  { parts: ["herdet", "glass"], joined: "herdetglass" },
  { parts: ["usb", "c"], joined: "usbc" },
  { parts: ["spill", "tastatur"], joined: "spilltastatur" },
  { parts: ["gaming", "tastatur"], joined: "gamingtastatur" },
  { parts: ["mobil", "holder"], joined: "mobilholder" },
  { parts: ["mobil", "deksel"], joined: "mobildeksel" },
  { parts: ["lade", "kabel"], joined: "ladekabel" },
  { parts: ["skjerm", "beskytter"], joined: "skjermbeskytter" },
];

const STOPWORDS = new Set([
  "og",
  "til",
  "for",
  "med",
  "en",
  "et",
  "av",
  "på",
  "i",
  "the",
  "a",
  "an",
  "of",
  "to",
]);

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[_/|+,]+/g, " ")
    .replace(/-/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandToken(token: string): string[] {
  const out = new Set<string>([token]);
  for (const group of SYNONYM_GROUPS) {
    const normalizedGroup = group.map((g) => normalizeText(g));
    if (normalizedGroup.includes(token) || group.includes(token)) {
      for (const g of normalizedGroup) out.add(g);
    }
  }
  // Compound tokens → also match original parts / spaced forms
  if (token === "mus" || token === "mouse" || token === "gamingmus" || token === "spillmus") {
    out.add("musematte");
    out.add("musmatte");
    out.add("mousepad");
  }
  if (token === "musematte" || token === "musmatte") {
    out.add("musematte");
    out.add("musmatte");
    out.add("mouse pad");
    out.add("mousepad");
  }
  if (token === "gamingpc") {
    out.add("gaming pc");
    out.add("gaming");
    out.add("pc");
    out.add("computer");
  }
  if (token === "minipc") {
    out.add("mini pc");
    out.add("mini");
    out.add("pc");
  }
  if (token === "tabletpc") {
    out.add("tablet pc");
    out.add("tablet");
    out.add("pc");
    out.add("nettbrett");
  }
  if (token === "phonecase") {
    out.add("phone case");
    out.add("deksel");
    out.add("case");
  }
  if (token === "mousepad") {
    out.add("mouse pad");
    out.add("musematte");
  }
  if (token === "usbc" || token === "usb c") {
    out.add("usb");
    out.add("usb c");
    out.add("usbc");
    out.add("type c");
    out.add("typec");
  }
  if (token === "spilltastatur" || token === "gamingtastatur") {
    out.add("tastatur");
    out.add("keyboard");
    out.add("gaming tastatur");
    out.add("spill tastatur");
    // Avoid bare "gaming"/"spill" — floods results with unrelated gaming gear
  }
  if (token === "mobilholder") {
    out.add("telefonholder");
    out.add("phone holder");
    out.add("phone stand");
    out.add("holder");
    // Avoid bare "mobil"/"telefon" — matches cases and headsets
  }
  if (token === "mobildeksel") {
    out.add("deksel");
    out.add("case");
    out.add("cover");
    out.add("etui");
    out.add("phone case");
    out.add("mobildeksel");
  }
  if (token === "skjermbeskytter") {
    out.add("skjermbeskytter");
    out.add("screen protector");
    out.add("screenprotector");
    out.add("herdet glass");
    out.add("tempered glass");
    // Avoid bare "skjerm" — matches every display product
  }
  if (token === "ladekabel") {
    out.add("ladekabel");
    out.add("kabel");
    out.add("cable");
    out.add("charging cable");
  }
  if (token === "webkamera") {
    out.add("webcam");
    out.add("webkamera");
  }
  for (const v of [...out]) {
    out.add(v.replace(/\s+/g, ""));
  }
  return [...out].filter(Boolean);
}

/** Split glued compounds before join/tokenize expand. */
function splitGluedCompounds(tokens: string[]): string[] {
  const sorted = [...COMPOUND_SPLITS].sort(
    (a, b) => b.glued.length - a.glued.length
  );
  const result: string[] = [];
  for (const token of tokens) {
    let matched = false;
    for (const rule of sorted) {
      const glued = normalizeText(rule.glued);
      if (token === glued) {
        for (const part of rule.parts) {
          result.push(normalizeText(part));
        }
        matched = true;
        break;
      }
    }
    if (!matched) result.push(token);
  }
  return result;
}

function applyQueryRewrites(normalized: string): string {
  let out = normalized;
  for (const rule of QUERY_REWRITES) {
    out = out.replace(rule.from, rule.to);
  }
  return normalizeText(out);
}

function applyCompounds(tokens: string[]): string[] {
  if (tokens.length < 2) return tokens;
  const result: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (const rule of COMPOUND_JOINS) {
      const n = rule.parts.length;
      if (i + n > tokens.length) continue;
      const slice = tokens.slice(i, i + n);
      const ok = rule.parts.every((p, idx) => {
        const t = slice[idx]!;
        const pn = normalizeText(p);
        return t === pn || expandToken(pn).includes(t);
      });
      if (ok) {
        // Keep joined form as primary token; parts remain searchable via expansions.
        result.push(normalizeText(rule.joined));
        i += n;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result.push(tokens[i]!);
      i += 1;
    }
  }
  return result;
}

export type ParsedQuery = {
  raw: string;
  normalized: string;
  tokens: string[];
  expansions: string[][];
  intent: SearchIntent;
  brands: string[];
};

function detectIntent(expansions: string[][], tokens: string[]): SearchIntent {
  const flat = new Set(expansions.flat());
  const toks = new Set(tokens.map((t) => normalizeText(t)));
  const has = (...keys: string[]) =>
    keys.some((k) => flat.has(normalizeText(k)));
  const hasToken = (...keys: string[]) =>
    keys.some((k) => toks.has(normalizeText(k)));

  const caseLike = has(
    "deksel",
    "case",
    "cover",
    "etui",
    "mobildeksel",
    "phonecase"
  );
  const tabletLike = has("ipad", "nettbrett", "tablet");

  if (caseLike && tabletLike) return "tablet_case";
  if (caseLike) return "phone_case";
  // Pad intent only from explicit pad tokens — not from mus→musematte expansion
  if (hasToken("musematte", "musmatte", "mousepad", "deskmat", "deskpad")) {
    return "mouse_pad";
  }
  if (has("tastatur", "keyboard")) return "keyboard";
  if (
    has("mus", "mouse", "gamingmus", "spillmus") &&
    !hasToken("musematte", "musmatte", "mousepad")
  ) {
    return "mouse";
  }
  if (
    has(
      "pc",
      "computer",
      "datamaskin",
      "desktop",
      "minipc",
      "gamingpc",
      "laptop"
    )
  ) {
    return "pc";
  }
  if (has("headset", "hodetelefon", "earbuds", "orepropper")) return "headset";
  if (has("lader", "charger", "powerbank", "oplader")) return "charger";
  if (has("kabel", "cable", "ladekabel")) return "cable";
  return "generic";
}

function detectBrands(tokens: string[], expansions: string[][]): string[] {
  const flat = new Set(expansions.flat());
  const brands: string[] = [];
  if (flat.has("iphone") || flat.has("apple iphone")) brands.push("iphone");
  if (flat.has("ipad")) brands.push("ipad");
  if (flat.has("samsung") || flat.has("galaxy")) brands.push("samsung");
  if (tokens.includes("apple")) brands.push("apple");
  return brands;
}

export function parseSearchQuery(raw: string): ParsedQuery | null {
  const rewritten = applyQueryRewrites(normalizeText(raw));
  if (!rewritten) return null;

  const rawTokens = rewritten
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));

  if (rawTokens.length === 0) return null;

  const tokens = applyCompounds(splitGluedCompounds(rawTokens));
  const expansions = tokens.map((t) => expandToken(t));
  const intent = detectIntent(expansions, tokens);
  const brands = detectBrands(tokens, expansions);

  return {
    raw,
    normalized: rewritten,
    tokens,
    expansions,
    intent,
    brands,
  };
}

function parseTags(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) {
      return parsed.map((t) => normalizeText(String(t))).filter(Boolean);
    }
  } catch {
    /* plain string */
  }
  return normalizeText(tags).split(" ").filter(Boolean);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryHit(haystack: string, needle: string): boolean {
  if (!needle) return false;
  if (needle.includes(" ")) {
    return haystack.includes(needle);
  }
  if (needle.length <= 3) {
    const re = new RegExp(`(?:^|\\s)${escapeRegExp(needle)}(?:\\s|$)`);
    return re.test(haystack);
  }
  const re = new RegExp(`(?:^|\\s)${escapeRegExp(needle)}(?:\\s|$)`);
  if (re.test(haystack)) return true;
  return haystack.includes(needle);
}

function fieldBlob(product: SearchableProduct): {
  name: string;
  sub: string;
  cat: string;
  tags: string;
  meta: string;
  short: string;
} {
  const name = normalizeText(product.name || "");
  const sub = normalizeText(product.subcategory || "");
  const cat = normalizeText(product.category || "");
  const tagsList = parseTags(product.tags || "[]");
  const tags = tagsList.join(" ");
  const meta = normalizeText(product.metaTitle || "");
  const short = normalizeText(product.shortDescription || "");
  return { name, sub, cat, tags, meta, short };
}

function tokenMatchedIn(
  haystack: string,
  expansions: string[],
  opts?: { allowSubstring?: boolean }
): boolean {
  for (const exp of expansions) {
    if (!exp) continue;
    if (wordBoundaryHit(haystack, exp)) return true;
    if (opts?.allowSubstring && exp.length >= 4 && haystack.includes(exp)) {
      return true;
    }
  }
  return false;
}

function scoreProduct(product: SearchableProduct, q: ParsedQuery): number {
  const f = fieldBlob(product);
  const signals = classifyProduct(f);
  let score = 0;
  let tokensHit = 0;
  let nameHits = 0;

  if (f.name === q.normalized) score += 220;
  if (f.name.startsWith(q.normalized)) score += 90;
  if (f.name.includes(q.normalized)) score += 55;

  for (let i = 0; i < q.tokens.length; i++) {
    const expansions = q.expansions[i]!;
    let hit = false;

    if (tokenMatchedIn(f.name, expansions, { allowSubstring: true })) {
      score += 48;
      nameHits += 1;
      hit = true;
      if (
        wordBoundaryHit(f.name, q.tokens[i]!) ||
        f.name.includes(q.tokens[i]!)
      ) {
        score += 18;
      }
    }
    if (tokenMatchedIn(f.meta, expansions, { allowSubstring: true })) {
      score += 22;
      hit = true;
    }
    if (tokenMatchedIn(f.sub, expansions, { allowSubstring: true })) {
      score += 16;
      hit = true;
    }
    if (tokenMatchedIn(f.cat, expansions, { allowSubstring: true })) {
      score += 10;
      hit = true;
    }
    if (tokenMatchedIn(f.tags, expansions, { allowSubstring: true })) {
      score += 8;
      hit = true;
    }
    if (tokenMatchedIn(f.short, expansions, { allowSubstring: true })) {
      score += 6;
      hit = true;
    }

    if (hit) tokensHit += 1;
  }

  if (q.tokens.length > 1) {
    if (tokensHit === q.tokens.length) score += 70;
    else if (tokensHit === 0) return 0;
    else score -= (q.tokens.length - tokensHit) * 35;
  } else if (tokensHit === 0) {
    return 0;
  }

  for (const brand of q.brands) {
    if (
      f.name.includes(brand) ||
      f.tags.includes(brand) ||
      f.meta.includes(brand)
    ) {
      score += 55;
    } else if (q.intent === "phone_case" || q.intent === "tablet_case") {
      score -= 40;
    }
  }

  score += intentAdjustment(q.intent, f, signals, product, q);

  // Hard gates — catalog tags are polluted; do not trust tag-only hits for intents.
  if (!passesIntentGate(q, f, signals, nameHits)) {
    return 0;
  }

  // Prefer titles that start with the primary product noun
  const primary = q.tokens[0]!;
  if (
    f.name.startsWith(primary) ||
    f.name.startsWith(expandToken(primary)[0] || primary)
  ) {
    score += 25;
  }

  score += primaryOverAccessoryAdjustment(q, f, signals);

  return score;
}

/**
 * When the query's main noun matches, rank the product itself above
 * holders/stands/bags/organizers for that product.
 */
function primaryOverAccessoryAdjustment(
  q: ParsedQuery,
  f: ReturnType<typeof fieldBlob>,
  s: ReturnType<typeof classifyProduct>
): number {
  const name = f.name;
  const queryWantsAccessory =
    /\b(stativ|holder|mappe|bag|veske|organizer|tripod|beskytter|sleeve|cooler)\b/.test(
      q.normalized
    ) ||
    q.tokens.some((t) =>
      /^(stativ|holder|mappe|bag|veske|beskytter|mobilholder|telefonholder|skjermbeskytter)$/.test(
        t
      )
    );

  const isAccessoryTitle =
    /\b(stativ|holder|mappe|organizer|bag|veske|tray|dust|sleeve|cooler|tripod|dock\s*stand)\b/.test(
      name
    ) || /bag\s*for|holder\s*for|stativ\s*for|organizer\s*for/.test(name);

  // Query is for the accessory itself → boost matching accessories, soft-demote pure products only lightly
  if (queryWantsAccessory) {
    if (isAccessoryTitle) return 35;
    return 0;
  }

  let adj = 0;

  // Demote accessory SKUs when searching for the core product
  if (isAccessoryTitle) {
    adj -= 75;
  }

  // Boost clear primary products for known intents
  if (q.intent === "keyboard" && s.looksKeyboard && !s.looksKeyboardCover) {
    adj += 40;
    if (
      q.tokens.some((t) => t === "spilltastatur" || t === "gamingtastatur") ||
      /spill|gaming/.test(q.normalized)
    ) {
      if (/gaming\s*tastatur|spill\s*tastatur/.test(name)) adj += 45;
    }
  }
  if (q.intent === "mouse" && s.looksMouse) adj += 40;
  if (q.intent === "mouse_pad" && s.looksMousePad) adj += 40;
  if (
    q.intent === "cable" &&
    /\b(kabel|cable|ladekabel)\b/.test(name) &&
    !isAccessoryTitle
  ) {
    adj += 35;
  }
  if (
    q.intent === "charger" &&
    /\b(lader|charger|powerbank|hurtiglader)\b/.test(name)
  ) {
    adj += 30;
  }
  if (
    q.expansions.flat().includes("mikrofon") ||
    q.expansions.flat().includes("microphone")
  ) {
    if (
      /kondensatormikrofon|\bmikrofon\b/.test(name) &&
      !/stativ|holder|arm/.test(name)
    ) {
      adj += 45;
    }
    if (/mikrofonstativ|mic\s*stand|boom\s*arm/.test(name)) adj -= 50;
  }
  if (
    q.expansions.flat().includes("webkamera") ||
    q.expansions.flat().includes("webcam")
  ) {
    if (/webkamera|webcam/.test(name)) adj += 40;
  }
  if (
    q.tokens.includes("mobilholder") ||
    q.normalized.includes("mobilholder")
  ) {
    if (/telefonholder|phone\s*holder|mobilholder/.test(name)) adj += 60;
    if (/kabelholder|cable\s*holder|mikrofonstativ/.test(name)) adj -= 70;
    if (/deksel|case|cover|etui|hodetelefon/.test(name) && !/holder/.test(name)) {
      adj -= 80;
    }
  }
  if (
    q.expansions.flat().includes("tastatur") ||
    q.expansions.flat().includes("keyboard")
  ) {
    if (s.looksKeyboard) adj += 25;
    if (/tastaturstativ|keyboard\s*stand|tastatur\s*holder/.test(name))
      adj -= 40;
    if (/converter|adapter/.test(name) && /tastatur|keyboard/.test(name)) {
      adj -= 35;
    }
  }

  return adj;
}

function classifyProduct(f: ReturnType<typeof fieldBlob>) {
  const name = f.name;
  const sub = f.sub;

  const looksKeyboardCover =
    /(tastatur|keyboard).{0,20}(deksel|case|cover|dust|sleeve|skin)/.test(
      name
    ) ||
    /(deksel|case|cover|dust|sleeve).{0,20}(tastatur|keyboard)/.test(name) ||
    /dust\s*cover|keyboard\s*cover|tastatur\s*deksel/.test(name) ||
    (/deksel|case|cover/.test(name) &&
      /(tastatur|keyboard|thinkpad)/.test(name));

  const looksPhoneCase =
    /(telefon|phone|iphone|samsung|galaxy|mobil).{0,24}(deksel|case|cover|etui)/.test(
      name
    ) ||
    /(deksel|case|cover|etui).{0,24}(telefon|phone|iphone|samsung|galaxy|mobil)/.test(
      name
    ) ||
    /personvern\s*deksel|mobildeksel|phone\s*case/.test(name);

  const looksTabletCase =
    /(nettbrett|tablet|ipad|pro11|flat\s*protective).{0,24}(deksel|case|cover|etui|mappe)/.test(
      name
    ) ||
    /(deksel|case|cover|mappe).{0,24}(nettbrett|tablet|ipad)/.test(name);

  const looksCaseWord = /\b(deksel|case|cover|etui|bumper)\b/.test(name);

  const looksMousePad =
    /musematte|mouse\s*pad|mousepad|desk\s*mat|desk\s*pad/.test(name) ||
    sub.includes("musematter");

  const looksMouse =
    ((/(^|\s)(mus|mouse|gamingmus|spillmus)(\s|$)/.test(name) ||
      sub.includes("gamingmus") ||
      sub.includes("datamus")) &&
      !looksMousePad);

  const looksKeyboard =
    /(^|\s)(tastatur|keyboard)(\s|$)/.test(name) && !looksKeyboardCover;

  const looksPeripheral =
    looksMouse ||
    looksKeyboard ||
    looksMousePad ||
    /\b(gamepad|controller|kontroller|headset|optical\s*mus)\b/.test(name);

  const looksLaptopAccessory =
    /laptopstativ|laptop\s*stand|laptop\s*cooler|laptop\s*sleeve|laptop\s*bag|laptop\s*table/.test(
      name
    );

  const looksRealPc =
    /\bgaming\s*pc\b|\bmini\s*pc\b|\bminipc\b|\bdesktop\b|\bstasjonar/.test(
      name
    ) ||
    (/\blaptop\b|\bnotebook\b/.test(name) &&
      !looksLaptopAccessory &&
      !looksPeripheral) ||
    /\btablet\s*pc\b/.test(name) ||
    (/\bnettbrett\b/.test(name) &&
      !looksPeripheral &&
      !/stativ|mappe|deksel|case|holder|tastatur/.test(name)) ||
    (sub === "laptop" && !looksLaptopAccessory && !looksPeripheral) ||
    sub.includes("minipc");

  const pcCompatNoise =
    looksPeripheral && /\bpc\b|\blaptop\b/.test(name);

  return {
    looksKeyboardCover,
    looksPhoneCase,
    looksTabletCase,
    looksCaseWord,
    looksMousePad,
    looksKeyboard,
    looksMouse,
    looksPeripheral,
    looksRealPc,
    looksLaptopAccessory,
    pcCompatNoise,
  };
}

function passesIntentGate(
  q: ParsedQuery,
  f: ReturnType<typeof fieldBlob>,
  s: ReturnType<typeof classifyProduct>,
  nameHits: number
): boolean {
  switch (q.intent) {
    case "phone_case":
      if (s.looksKeyboardCover) return false;
      if (s.looksPhoneCase) return true;
      if (s.looksTabletCase && q.brands.includes("ipad")) return true;
      // Bare "deksel": allow case-word in name under Mobil, or clear case title
      if (s.looksCaseWord && f.cat.includes("mobil") && nameHits > 0) return true;
      if (s.looksCaseWord && s.looksTabletCase) return true;
      return false;

    case "tablet_case":
      if (s.looksKeyboardCover && !s.looksTabletCase) return false;
      return s.looksTabletCase || (s.looksCaseWord && /nettbrett|tablet|ipad/.test(f.name));

    case "mouse_pad":
      return s.looksMousePad || /musematte|musmatte|mousepad|mouse pad/.test(f.name);

    case "pc":
      if (s.pcCompatNoise && !s.looksRealPc) return false;
      if (s.looksLaptopAccessory && !q.normalized.includes("stativ")) return false;
      if (s.looksPeripheral && !s.looksRealPc) return false;
      if (
        /dokking|docking|\bhub\b|stativ|cooler|sleeve|telefonholder|phone\s*holder|mobilholder/.test(
          f.name
        )
      ) {
        return false;
      }
      return s.looksRealPc || /\btablet\s*pc\b/.test(f.name);

    case "keyboard":
      if (s.looksMouse && !s.looksKeyboard) return false;
      // Furniture / trays with "tastatur" in the name are weak
      if (/desk|skrivebord|tray|whiteboard|message\s*note/.test(f.name) && s.looksKeyboard) {
        // still allow but only if clearly a keyboard product — handled in scoring
      }
      return s.looksKeyboard || /tastatur|keyboard/.test(f.name);

    case "mouse":
      // Allow pads too — "mus" expansions include musematte; mice still rank higher via looksMouse
      return (
        s.looksMouse ||
        s.looksMousePad ||
        /(^|\s)(mus|mouse)(\s|$)/.test(f.name) ||
        /musematte|musmatte|mousepad|mouse\s*pad/.test(f.name)
      );

    default:
      return true;
  }
}

function intentAdjustment(
  intent: SearchIntent,
  f: ReturnType<typeof fieldBlob>,
  s: ReturnType<typeof classifyProduct>,
  product: SearchableProduct,
  q: ParsedQuery
): number {
  let adj = 0;
  const name = f.name;
  const sub = f.sub;
  const cat = f.cat;

  switch (intent) {
    case "phone_case":
      if (s.looksPhoneCase) adj += 90;
      if (cat.includes("mobil")) adj += 35;
      if (sub.includes("mobildeksel") && s.looksPhoneCase) adj += 25;
      if (s.looksKeyboardCover) adj -= 120;
      if (s.looksTabletCase && !s.looksPhoneCase) adj -= 15;
      break;

    case "tablet_case":
      if (s.looksTabletCase) adj += 100;
      if (s.looksPhoneCase) adj += 20;
      if (s.looksKeyboardCover) adj -= 90;
      if (name.includes("ipad") || name.includes("nettbrett") || name.includes("tablet")) {
        adj += 40;
      }
      break;

    case "mouse_pad":
      if (s.looksMousePad) adj += 110;
      if (sub.includes("musematter")) adj += 40;
      if (s.looksMouse && !s.looksMousePad) adj -= 70;
      if (s.looksKeyboard) adj -= 40;
      break;

    case "keyboard":
      if (s.looksKeyboard) adj += 90;
      if (sub === "tastatur" || sub.includes("tastatur")) adj += 35;
      if (s.looksKeyboardCover) adj -= 60;
      if (s.looksMouse && !s.looksKeyboard) adj -= 75;
      if (s.looksMousePad) adj -= 40;
      if (/desk|skrivebord|tray|whiteboard|message\s*note|sliding/.test(name)) {
        adj -= 80;
      }
      break;

    case "mouse":
      if (s.looksMouse) adj += 95;
      if (sub.includes("gamingmus") || sub.includes("datamus")) adj += 40;
      if (s.looksMousePad) adj -= 55;
      if (s.looksKeyboard && !s.looksMouse) adj -= 50;
      if (q.tokens.length === 1 && /tastatur|keyboard|converter|kabel|cable/.test(name)) {
        adj -= 55;
      }
      if (/^mus(\s|$)/.test(name) && /gaming|tradlos|wireless|wired|optisk|optical/.test(name)) {
        adj += 30;
      }
      break;

    case "pc":
      if (s.looksRealPc) adj += 100;
      if (cat.includes("data")) adj += 20;
      if (s.pcCompatNoise && !s.looksRealPc) adj -= 100;
      if (/\btablet\s*pc\b/.test(name)) adj += 30;
      if (s.looksLaptopAccessory) adj -= 80;
      if (q.tokens.includes("gamingpc") || q.normalized.includes("gaming")) {
        if (/gaming/.test(name) && s.looksRealPc) adj += 50;
      }
      break;

    case "headset":
      if (/headset|hodetelefon|earbuds|oreprop/.test(name)) adj += 90;
      // Combo kits rank lower than dedicated headsets
      if (/tastatur|keyboard|mus|mouse/.test(name)) adj -= 40;
      break;

    case "charger":
      if (/lader|charger|powerbank|tradlos lading/.test(name)) adj += 80;
      break;

    case "cable":
      if (/\bkabel\b|\bcable\b/.test(name)) adj += 80;
      // Organizer bags / holders are weaker than actual cables
      if (/holder|organizer|bag|veske/.test(name)) adj -= 50;
      break;

    default: {
      // Generic: demote pure accessories when query looks like a device noun
      if (
        /nettbrett|tablet|mikrofon|hoyttaler|webkamera/.test(q.normalized) &&
        /stativ|holder|mappe|tripod/.test(name) &&
        !new RegExp(q.normalized).test(name.split(" ")[0] || "")
      ) {
        // handled below via name-start heuristic in scoreProduct
      }
      // Boost device titles for nettbrett / mikrofon style queries
      if (q.normalized === "nettbrett" && /^nettbrett(\s|$)/.test(name) && !/stativ|mappe|deksel/.test(name)) {
        adj += 80;
      }
      if (q.normalized === "mikrofon" && /kondensatormikrofon|^mikrofon(\s|$)/.test(name) && !/stativ/.test(name)) {
        adj += 80;
      }
      if (q.normalized === "mikrofon" && /stativ/.test(name)) adj -= 60;
      if (q.normalized === "nettbrett" && /stativ|mappe|deksel/.test(name)) adj -= 50;
      break;
    }
  }

  if (/^\d+$/.test(product.name.trim())) adj -= 20;
  return adj;
}

/**
 * Rank products for a storefront search query.
 * Returns only products with score > 0, highest first.
 */
export function rankProductsForSearch<T extends SearchableProduct>(
  products: T[],
  rawQuery: string
): ScoredProduct<T>[] {
  const parsed = parseSearchQuery(rawQuery);
  if (!parsed) return [];

  const scored: ScoredProduct<T>[] = [];
  for (const product of products) {
    const searchScore = scoreProduct(product, parsed);
    if (searchScore > 0) {
      scored.push({ ...product, searchScore });
    }
  }

  scored.sort((a, b) => {
    if (b.searchScore !== a.searchScore) return b.searchScore - a.searchScore;
    return a.name.localeCompare(b.name, "nb");
  });

  return scored;
}

/** Drop weak tag-only noise relative to the best hit. */
export function filterByMinRelevance<T extends ScoredProduct>(
  products: T[],
  minScore = 25
): T[] {
  if (products.length === 0) return products;
  const top = products[0]!.searchScore;
  const floor = Math.max(minScore, Math.floor(top * 0.28));
  return products.filter((p) => p.searchScore >= floor);
}
