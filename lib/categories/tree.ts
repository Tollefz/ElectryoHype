/**
 * ElectroHypeX Category Tree V2 — function-first taxonomy.
 *
 * Marketing words (Gaming, RGB, Pro, Ultra, Max) never override product function.
 * Pure module — safe on server and client.
 */

import { getAllDbValues } from "@/lib/categories";

export interface SubcategoryDefinition {
  name: string;
  keywords: string[];
}

/** Permanent subcategory tree keyed by Product.category dbValue. */
export const CATEGORY_TREE: Record<string, SubcategoryDefinition[]> = {
  "Data & IT": [
    {
      name: "PC",
      keywords: ["desktop", "stasjonær", "tower", "pc-kabinett", "gaming pc", "minipc", "mini pc"],
    },
    {
      name: "Laptop",
      keywords: [
        "laptop",
        "bærbar",
        "notebook",
        "laptop stativ",
        "laptopstativ",
        "kjøleplate",
        "laptop sleeve",
        "laptop bag",
      ],
    },
    {
      name: "Kabler",
      keywords: [
        "hdmi",
        "displayport",
        "vga",
        "dvi",
        "skjermkabel",
        "forlengelseskabel",
        "ethernet kabel",
        "nettverkskabel",
      ],
    },
    {
      name: "USB",
      keywords: ["usb kabel", "usb-a", "usb adapter", "usb forlenger", "usb extension"],
    },
    {
      name: "SSD",
      keywords: [
        "ssd",
        "harddisk",
        "nvme",
        "minnekort",
        "sd-kort",
        "usb-minne",
        "minnepenn",
        "flash drive",
        "lagring",
      ],
    },
    {
      name: "Hub",
      keywords: ["usb hub", "usb-hub", "hub", "usb-c hub", "multiport hub"],
    },
    {
      name: "Docking",
      keywords: ["dokkingstasjon", "docking", "dock", "dongle", "kortleser", "card reader"],
    },
    {
      name: "Skjerm",
      keywords: ["skjerm", "monitor", "display", "ultrawide", "skjermfilter"],
    },
    {
      name: "Tilbehør",
      keywords: [
        "webkamera",
        "webcam",
        "pc-mus",
        "kontormus",
        "office mouse",
        "pc-tastatur",
        "numpad",
        "musematte kontor",
      ],
    },
  ],
  Gaming: [
    {
      name: "Gamingmus",
      keywords: [
        "gaming mus",
        "gaming mouse",
        "spillmus",
        "fps mouse",
        "gamer mouse",
        "esport mouse",
      ],
    },
    {
      name: "Tastatur",
      keywords: [
        "gaming tastatur",
        "gaming keyboard",
        "mekanisk tastatur",
        "mechanical keyboard",
        "gamer keyboard",
      ],
    },
    {
      name: "Headset",
      keywords: [
        "gaming headset",
        "gaming hodetelefon",
        "gamer headset",
        "headset stativ",
      ],
    },
    {
      name: "Musematter",
      keywords: [
        "gaming musematte",
        "gaming mousepad",
        "rgb mouse pad",
        "rgb mousepad",
        "mouse pad",
        "mousepad",
        "musematte",
        "desk mat",
        "desk pad",
        "extended mouse pad",
      ],
    },
    {
      name: "Streaming",
      keywords: [
        "stream",
        "streaming",
        "capture card",
        "elgato",
        "stream deck",
        "green screen",
      ],
    },
    {
      name: "RGB",
      keywords: [
        "rgb strip",
        "led strip gaming",
        "led-list",
        "gaming lys",
        "neon gaming",
        "lysstripe gaming",
      ],
    },
    {
      name: "Kontrollere",
      keywords: [
        "kontroller",
        "controller",
        "gamepad",
        "joystick",
        "thumb grip",
        "ladestasjon kontroller",
        "ps5",
        "ps4",
        "xbox",
        "nintendo",
        "switch",
        "konsoll",
      ],
    },
  ],
  "Mobil & Tilbehør": [
    {
      name: "Mobiltelefon",
      keywords: ["mobiltelefon", "smartphone", "smarttelefon", "mobiltelefoner"],
    },
    {
      name: "Mobildeksel",
      keywords: [
        "phone case",
        "mobildeksel",
        "deksel",
        "etui",
        "case",
        "cover",
        "bumper",
        "veske",
        "wallet",
        "lommebok",
        "iphone case",
        "samsung case",
      ],
    },
    {
      name: "Skjermbeskytter",
      keywords: [
        "skjermbeskytter",
        "screen protector",
        "herdet glass",
        "tempered glass",
        "displayfilm",
        "kameralinse",
        "camera lens",
        "linsebeskytter",
      ],
    },
    {
      name: "Powerbank",
      keywords: [
        "powerbank",
        "power bank",
        "nødlader",
        "batteripakke",
        "portable charger",
      ],
    },
    {
      name: "Lader",
      keywords: [
        "lader",
        "charger",
        "charging",
        "vegglader",
        "billader",
        "magsafe",
        "wireless charger",
        "trådløs lader",
        "trådløs lading",
        "charging station",
      ],
    },
    {
      name: "Kabel",
      keywords: [
        "ladekabel",
        "usb-c kabel",
        "lightning",
        "charging cable",
        "iphone kabel",
        "data cable phone",
      ],
    },
    {
      name: "Holder",
      keywords: [
        "holder",
        "stativ",
        "mount",
        "bilholder",
        "mobilholder",
        "phone stand",
        "brakett",
        "bracket",
        "tripod",
      ],
    },
    {
      name: "Trådløs lading",
      keywords: [
        "trådløs lading",
        "wireless charging",
        "magsafe charger",
        "qi charger",
        "wireless pad",
      ],
    },
  ],
  "TV, Lyd & Bilde": [
    {
      name: "TV",
      keywords: ["tv-feste", "veggfeste", "tv stativ", "wall mount", "smart tv", "fjernkontroll tv"],
    },
    {
      name: "Projektor",
      keywords: ["projektor", "lerret", "projector", "beamer"],
    },
    {
      name: "Soundbar",
      keywords: ["soundbar", "sound bar", "lydbjelke"],
    },
    {
      name: "Høyttaler",
      keywords: [
        "høyttaler",
        "speaker",
        "bluetooth-høyttaler",
        "bluetooth speaker",
        "portable speaker",
      ],
    },
    {
      name: "Hodetelefoner",
      keywords: [
        "hodetelefon",
        "headphones",
        "ørepropper",
        "earbuds",
        "earbud",
        "airpods",
        "tws",
        "in-ear",
        "over-ear",
        "on-ear",
        "headset audio",
      ],
    },
    {
      name: "Mikrofon",
      keywords: ["mikrofon", "microphone", "mic", "condenser mic", "usb mic"],
    },
  ],
  "Hjem & Fritid": [
    {
      name: "Smart Home",
      keywords: [
        "smart home",
        "smarthjem",
        "iot",
        "sensor",
        "smartplugg",
        "smart plug",
        "smart lys",
      ],
    },
    {
      name: "LED",
      keywords: ["led rose", "led lamp", "led-lampe", "led strip home", "lyskjede", "nattlys"],
    },
    {
      name: "Dekorasjon",
      keywords: ["dekorasjon", "dekor", "ornament", "figur", "rose lamp", "ambient light"],
    },
    {
      name: "Organisering",
      keywords: [
        "organiser",
        "oppbevaring",
        "storage",
        "kabelholder",
        "kabelorganiser",
        "boks",
      ],
    },
    {
      name: "Belysning",
      keywords: ["lampe", "lys", "pære", "belysning", "desk lamp", "bordlampe", "gulvlampe"],
    },
  ],
  Hvitevarer: [
    {
      name: "Kjøkken",
      keywords: [
        "blender",
        "mikser",
        "foodprosessor",
        "kaffetrakter",
        "vannkoker",
        "brødrister",
        "kjøkken",
      ],
    },
    {
      name: "Rengjøring",
      keywords: ["støvsuger", "robotstøvsuger", "rengjøring", "mop", "vacuum"],
    },
    {
      name: "Klima",
      keywords: ["vifte", "luftkjøler", "luftfukter", "avfukter", "heater", "klima"],
    },
    {
      name: "Småelektrisk",
      keywords: ["småelektrisk", "hårføner", "barbermaskin", "trimmer", "filter", "reservedel"],
    },
  ],
};

/** Legacy subcategory name → current tree name (same main). */
const SUBCATEGORY_ALIASES: Record<string, Record<string, string>> = {
  "Mobil & Tilbehør": {
    Deksler: "Mobildeksel",
    "Deksler & Etuier": "Mobildeksel",
    "Ladere & Kabler": "Lader",
    Ladere: "Lader",
    Kabler: "Kabel",
    Powerbanks: "Powerbank",
    Holdere: "Holder",
    "Holdere & Stativ": "Holder",
    Skjermbeskyttere: "Skjermbeskytter",
    Kamerabeskyttelse: "Skjermbeskytter",
  },
  "Data & IT": {
    "USB-huber & Adaptere": "Hub",
    Docking: "Docking",
    "Tastatur & Mus": "Tilbehør",
    Mus: "Tilbehør",
    Tastatur: "Tilbehør",
    "Kabler & Tilkobling": "Kabler",
    "PC-tilbehør": "Tilbehør",
    "Laptop-tilbehør": "Laptop",
    Lagring: "SSD",
    Nettverk: "Tilbehør",
  },
  Gaming: {
    Mus: "Gamingmus",
    "Gaming Mus & Tastatur": "Gamingmus",
    "Gaming Headset": "Headset",
    Kontroller: "Kontrollere",
    "Kontrollere & Tilbehør": "Kontrollere",
    "Konsoll-tilbehør": "Kontrollere",
    "RGB-belysning": "RGB",
  },
  "TV, Lyd & Bilde": {
    Høyttalere: "Høyttaler",
    "TV-fester": "TV",
    "TV-fester & Stativ": "TV",
    "Projektor & Tilbehør": "Projektor",
    "Kabler & Adaptere": "TV",
  },
  "Hjem & Fritid": {
    "Smart hjem": "Smart Home",
    Belysning: "Belysning",
    Kjøkken: "Organisering",
    "Sport & Trening": "Organisering",
    "Bil-tilbehør": "Organisering",
    "Bil-elektronikk": "Organisering",
    Verktøy: "Organisering",
  },
  Hvitevarer: {
    Kjøkkenmaskiner: "Kjøkken",
    "Tilbehør & Deler": "Småelektrisk",
  },
};

/** Map any historical / supplier category string → allowlist main or null. */
const LEGACY_MAIN_MAP: Record<string, string> = {
  elektronikk: "Hjem & Fritid",
  electronics: "Hjem & Fritid",
  "tv & lyd": "TV, Lyd & Bilde",
  "tv lyd": "TV, Lyd & Bilde",
  "pc & data": "Data & IT",
  "pc data": "Data & IT",
  datamaskiner: "Data & IT",
  computers: "Data & IT",
  computer: "Data & IT",
  "smart home": "Hjem & Fritid",
  smarthome: "Hjem & Fritid",
  mobil: "Mobil & Tilbehør",
  phone: "Mobil & Tilbehør",
  phones: "Mobil & Tilbehør",
  "mobile accessories": "Mobil & Tilbehør",
  gaming: "Gaming",
  games: "Gaming",
  "consumer electronics": "Hjem & Fritid",
  accessories: "Hjem & Fritid",
  "home & garden": "Hjem & Fritid",
  "home appliances": "Hvitevarer",
  appliances: "Hvitevarer",
  audio: "TV, Lyd & Bilde",
  video: "TV, Lyd & Bilde",
  "tv audio": "TV, Lyd & Bilde",
};

/**
 * High-priority mobil function signals — beat Gaming / RGB / Pro / Ultra / Max.
 */
const MOBIL_FUNCTION_RULES: Array<{ pattern: RegExp; subcategory: string }> = [
  {
    pattern:
      /\b(phone\s*case|mobildeksel|iphone\s*case|samsung\s*case|galaxy\s*case|pixel\s*case)\b/i,
    subcategory: "Mobildeksel",
  },
  {
    pattern: /\b(case|cover|deksel|etui|bumper)\b/i,
    subcategory: "Mobildeksel",
  },
  {
    pattern: /\b(screen\s*protector|skjermbeskytter|herdet\s*glass|tempered\s*glass)\b/i,
    subcategory: "Skjermbeskytter",
  },
  {
    pattern: /\b(power\s*bank|powerbank|nødlader)\b/i,
    subcategory: "Powerbank",
  },
  {
    pattern: /\b(magsafe|qi\s*charger|wireless\s*charg|trådløs\s*lad)/i,
    subcategory: "Trådløs lading",
  },
  {
    pattern: /\b(charger|lader|charging\s*station|vegglader)\b/i,
    subcategory: "Lader",
  },
  {
    pattern: /\b(lightning|ladekabel|charging\s*cable|usb[- ]?c\s*kabel)\b/i,
    subcategory: "Kabel",
  },
  {
    pattern: /\b(iphone|samsung|galaxy|pixel|magsafe)\b/i,
    subcategory: "Mobildeksel",
  },
];

/** True product-function gaming (not phone/audio marketing). */
const TRUE_GAMING_PRODUCT =
  /\b(gaming\s*)?(mouse|mus|keyboard|tastatur|headset|mouse\s*pad|mousepad|musematte|desk\s*mat|desk\s*pad|gamepad|controller|kontroller|joystick)\b/i;

const AUDIO_FUNCTION =
  /\b(earbuds?|ørepropper|headphones?|hodetelefon|airpods|tws|speaker|høyttaler|soundbar|mikrofon|microphone)\b/i;

const HOME_LIGHT_FUNCTION =
  /\b(lampe|lamp|lys|led\s*rose|rose\s*lamp|nattlys|pære|belysning|dekor)\b/i;

export function assertMainCategory(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return getAllDbValues().includes(value) ? value : null;
}

export function listSubsFor(main: string): string[] {
  return (CATEGORY_TREE[main] || []).map((s) => s.name);
}

export function isValidSubcategory(
  main: string | null | undefined,
  sub: string | null | undefined
): boolean {
  if (!main || !sub?.trim()) return false;
  return listSubsFor(main).includes(sub);
}

/** Normalize legacy/alias subcategory into current tree name for a main. */
export function normalizeSubcategory(
  main: string,
  sub: string | null | undefined
): string | null {
  if (!sub?.trim()) return null;
  if (isValidSubcategory(main, sub)) return sub;
  const alias = SUBCATEGORY_ALIASES[main]?.[sub];
  if (alias && isValidSubcategory(main, alias)) return alias;
  return null;
}

/**
 * Map supplier / legacy category strings to allowlist main.
 * Returns null when unknown (caller must run AI / heuristics).
 */
export function normalizeLegacyCategory(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const exact = assertMainCategory(trimmed);
  if (exact) return exact;

  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (LEGACY_MAIN_MAP[key]) return LEGACY_MAIN_MAP[key];

  // Function-first even for legacy paths
  if (/phone|mobile|mobil|iphone|android|magsafe|powerbank/i.test(key)) {
    return "Mobil & Tilbehør";
  }
  if (/speaker|soundbar|headphone|earbud|projector|audio|video|microphone/i.test(key)) {
    return "TV, Lyd & Bilde";
  }
  if (/gaming\s*(mouse|keyboard|headset|pad)|gamepad|esport mouse/i.test(key)) {
    return "Gaming";
  }
  if (/laptop|computer|pc |usb hub|docking|ssd|monitor/i.test(key)) {
    return "Data & IT";
  }
  if (/appliance|kitchen appliance|hvitevare/i.test(key)) return "Hvitevarer";
  if (/home|garden|lighting|led|lamp|tool/i.test(key)) return "Hjem & Fritid";

  return null;
}

/**
 * Detect best subcategory for a main from free text.
 */
export function detectSubcategory(category: string, text: string): string | null {
  const definitions = CATEGORY_TREE[category];
  if (!definitions?.length) return null;

  const haystack = text.toLowerCase();
  let best: { name: string; hits: number } | null = null;

  for (const def of definitions) {
    let hits = 0;
    for (const keyword of def.keywords) {
      if (haystack.includes(keyword.toLowerCase())) {
        hits += keyword.includes(" ") ? 2 : 1;
      }
    }
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { name: def.name, hits };
    }
  }

  return best?.name ?? null;
}

/**
 * Function-first heuristic: product use beats marketing (Gaming/RGB/Pro/Ultra/Max).
 */
export function inferMainAndSub(text: string): {
  main: string;
  subcategory: string | null;
  confidence: number;
} {
  const haystack = (text || "").toLowerCase();
  if (!haystack.trim()) {
    return { main: "Hjem & Fritid", subcategory: null, confidence: 40 };
  }

  // 1) Mobil function always wins over Gaming/RGB marketing
  for (const rule of MOBIL_FUNCTION_RULES) {
    if (rule.pattern.test(haystack)) {
      // Avoid treating PC USB-C hub as mobil cable
      if (
        rule.subcategory === "Kabel" &&
        /\b(hub|dock|docking|laptop|monitor|ssd)\b/i.test(haystack)
      ) {
        continue;
      }
      // Avoid "case" matching laptop bag without phone signal when clearly PC
      if (
        rule.subcategory === "Mobildeksel" &&
        /\b(laptop|pc|monitor|ssd|hub|dock)\b/i.test(haystack) &&
        !/\b(phone|iphone|samsung|galaxy|pixel|mobil)\b/i.test(haystack)
      ) {
        continue;
      }
      return {
        main: "Mobil & Tilbehør",
        subcategory: rule.subcategory,
        confidence: 96,
      };
    }
  }

  // 2) Audio / speaker function → TV, Lyd & Bilde (even "Gaming Earbuds")
  if (AUDIO_FUNCTION.test(haystack)) {
    const sub = detectSubcategory("TV, Lyd & Bilde", haystack) || "Hodetelefoner";
    return { main: "TV, Lyd & Bilde", subcategory: sub, confidence: 94 };
  }

  // 3) True gaming peripherals (mouse/keyboard/pad/controller) — not phone cases
  if (TRUE_GAMING_PRODUCT.test(haystack)) {
    let sub: string | null = null;
    if (/\b(musematte|mouse\s*pad|mousepad|desk\s*mat|desk\s*pad)\b/i.test(haystack)) {
      sub = "Musematter";
    } else if (/\b(headset)\b/i.test(haystack)) {
      sub = "Headset";
    } else if (/\b(tastatur|keyboard)\b/i.test(haystack)) {
      sub = "Tastatur";
    } else if (/\b(mus|mouse)\b/i.test(haystack)) {
      sub = "Gamingmus";
    } else if (/\b(kontroller|controller|gamepad|joystick|ps5|xbox|switch)\b/i.test(haystack)) {
      sub = "Kontrollere";
    } else if (/\b(stream|capture\s*card)\b/i.test(haystack)) {
      sub = "Streaming";
    } else if (/\brgb\b|led\s*strip/i.test(haystack)) {
      sub = "RGB";
    } else {
      sub = detectSubcategory("Gaming", haystack) || "Gamingmus";
    }
    return { main: "Gaming", subcategory: sub, confidence: 95 };
  }

  // 4) Home lighting / décor (LED Rose Lamp etc.)
  if (HOME_LIGHT_FUNCTION.test(haystack)) {
    const sub = detectSubcategory("Hjem & Fritid", haystack) || "Belysning";
    return { main: "Hjem & Fritid", subcategory: sub, confidence: 93 };
  }

  // 5) Data & IT strong signals
  if (/\b(usb[- ]?c?\s*hub|usb[- ]?hub|dokking|docking|ssd|nvme|laptop|monitor|skjerm)\b/i.test(haystack)) {
    const sub = detectSubcategory("Data & IT", haystack) || "Tilbehør";
    return { main: "Data & IT", subcategory: sub, confidence: 92 };
  }

  // 6) Keyword scoring across tree
  let best: { main: string; subcategory: string; hits: number } | null = null;
  for (const [main, defs] of Object.entries(CATEGORY_TREE)) {
    for (const def of defs) {
      let hits = 0;
      for (const keyword of def.keywords) {
        if (haystack.includes(keyword.toLowerCase())) {
          hits += keyword.includes(" ") ? 2 : 1;
        }
      }
      if (hits > 0 && (!best || hits > best.hits)) {
        best = { main, subcategory: def.name, hits };
      }
    }
  }

  if (best && best.hits >= 2) {
    return {
      main: best.main,
      subcategory: best.subcategory,
      confidence: Math.min(94, 55 + best.hits * 8),
    };
  }

  const legacy = normalizeLegacyCategory(text);
  if (legacy) {
    return {
      main: legacy,
      subcategory: detectSubcategory(legacy, haystack),
      confidence: 55,
    };
  }

  return {
    main: "Hjem & Fritid",
    subcategory: detectSubcategory("Hjem & Fritid", haystack),
    confidence: 45,
  };
}
