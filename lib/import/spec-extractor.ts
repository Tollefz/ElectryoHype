/**
 * Specification and package-contents extraction from scraped product text.
 *
 * Suppliers rarely provide structured specs, but titles/descriptions often
 * contain material, dimensions, compatibility, pack counts etc. This module
 * extracts everything it can find so no specification is lost.
 *
 * Pure module – safe to use on both server and client.
 */

const MATERIAL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bherdet\s+glass\b|\btempered\s+glass\b/i, label: "Herdet glass" },
  { pattern: /\bsilikon\b|\bsilicone\b/i, label: "Silikon" },
  { pattern: /\btpu\b/i, label: "TPU" },
  { pattern: /\bpolykarbonat\b|\bpolycarbonate\b/i, label: "Polykarbonat" },
  { pattern: /\baluminium\b|\baluminum\b/i, label: "Aluminium" },
  { pattern: /\brustfritt\s+stål\b|\bstainless\s+steel\b/i, label: "Rustfritt stål" },
  { pattern: /\bmetall\b|\bmetal\b/i, label: "Metall" },
  { pattern: /\bskinn\b|\blær\b|\bleather\b/i, label: "Skinn/lær" },
  { pattern: /\bnylon\b/i, label: "Nylon" },
  { pattern: /\bplast\b|\bplastic\b|\babs\b/i, label: "Plast" },
  { pattern: /\bkarbonfiber\b|\bcarbon\s+fiber\b/i, label: "Karbonfiber" },
  { pattern: /\bakryl\b|\bacrylic\b/i, label: "Akryl" },
];

const DEVICE_MODEL_PATTERN =
  /\b((?:iphone|ipad|airpods|apple\s*watch|macbook|samsung\s+galaxy|galaxy|huawei|xiaomi|oneplus|google\s*pixel|pixel|ps5|ps4|xbox(?:\s*(?:one|series\s*[xs]))?|nintendo\s*switch)[\w /+.-]{0,30})/i;

const DEVICE_BRAND_CASING: Record<string, string> = {
  iphone: "iPhone",
  ipad: "iPad",
  airpods: "AirPods",
  macbook: "MacBook",
  oneplus: "OnePlus",
  ps5: "PS5",
  ps4: "PS4",
};

/** Keep only brand + model-like tokens ("iPhone 16 Pro Max", not trailing text). */
function trimDeviceModel(raw: string): string {
  const words = raw.replace(/\s+/g, " ").trim().split(" ");
  const first = words[0];
  const kept: string[] = [DEVICE_BRAND_CASING[first.toLowerCase()] || first];
  for (const word of words.slice(1)) {
    if (
      /^(pro|max|plus|mini|ultra|air|se|fe|lite|one|series|serie[ns]?|watch|galaxy|note|s|x)$/i.test(word) ||
      /^\d+[a-z]*$/i.test(word) ||
      /^[a-z]\d+$/i.test(word) ||
      /^[\d/+-]+$/.test(word)
    ) {
      kept.push(word);
    } else {
      break;
    }
  }
  return kept.join(" ");
}

function cleanValue(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[,.;:]+$/, "").trim();
}

/**
 * Extract structured specifications from title + description text.
 * Existing specs are preserved and take priority over extracted values.
 */
export function extractSpecs(
  title: string,
  description: string,
  existingSpecs: Record<string, string> = {}
): Record<string, string> {
  const text = `${title}\n${description}`;
  const extracted: Record<string, string> = {};

  // Material
  for (const { pattern, label } of MATERIAL_PATTERNS) {
    if (pattern.test(text)) {
      extracted["Materiale"] = label;
      break;
    }
  }

  // Compatibility (device models)
  const deviceMatch = text.match(DEVICE_MODEL_PATTERN);
  if (deviceMatch) {
    const device = trimDeviceModel(cleanValue(deviceMatch[1]));
    if (device && device.length <= 60) {
      extracted["Kompatibilitet"] = device;
    }
  }

  // Dimensions: "10x20 cm", "120 cm", "2 m", "1,5 meter"
  const dimensionMatch =
    text.match(/\b(\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?)\s*(mm|cm|m)\b/i) ||
    text.match(/\b(\d+(?:[.,]\d+)?)\s*(mm|cm|m|meter|tommer|inch|")\b/i);
  if (dimensionMatch) {
    extracted["Mål"] = cleanValue(`${dimensionMatch[1]} ${dimensionMatch[2]}`);
  }

  // Weight
  const weightMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|gram|g)\b/i);
  if (weightMatch && weightMatch[2].toLowerCase() !== "g") {
    extracted["Vekt"] = cleanValue(`${weightMatch[1]} ${weightMatch[2]}`);
  } else if (weightMatch) {
    const grams = parseFloat(weightMatch[1].replace(",", "."));
    if (grams >= 5) {
      extracted["Vekt"] = `${weightMatch[1]} g`;
    }
  }

  // Thickness ("0.3mm tykk", "9H")
  const thicknessMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*mm\s*(?:tykk|thickness|tynn)/i);
  if (thicknessMatch) {
    extracted["Tykkelse"] = `${thicknessMatch[1]} mm`;
    // Don't duplicate the same measurement as dimensions
    if (extracted["Mål"] === extracted["Tykkelse"]) {
      delete extracted["Mål"];
    }
  }
  if (/\b9\s*h\b/i.test(text)) {
    extracted["Hardhet"] = "9H";
  }

  // Power / voltage / battery
  const wattMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*w(att)?\b/i);
  if (wattMatch) {
    extracted["Effekt"] = `${wattMatch[1]} W`;
  }
  const voltMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*v(olt)?\b/i);
  if (voltMatch) {
    extracted["Spenning"] = `${voltMatch[1]} V`;
  }
  const mahMatch = text.match(/\b(\d[\d\s.,]*)\s*mah\b/i);
  if (mahMatch) {
    extracted["Batterikapasitet"] = `${cleanValue(mahMatch[1])} mAh`;
  }

  // Connectivity
  if (/\bbluetooth\s*(\d(?:\.\d)?)?/i.test(text)) {
    const btMatch = text.match(/\bbluetooth\s*(\d(?:\.\d)?)/i);
    extracted["Tilkobling"] = btMatch?.[1] ? `Bluetooth ${btMatch[1]}` : "Bluetooth";
  } else if (/\busb-?c\b/i.test(text)) {
    extracted["Tilkobling"] = "USB-C";
  } else if (/\btrådløs|wireless\b/i.test(text)) {
    extracted["Tilkobling"] = "Trådløs";
  }

  // Water resistance
  const ipMatch = text.match(/\bip(x?\d{1,2})\b/i);
  if (ipMatch) {
    extracted["Vannbestandighet"] = `IP${ipMatch[1].toUpperCase()}`;
  }

  // Pack count
  const packMatch = text.match(/\b(\d+)\s*[- ]?\s*(?:stk|pk|pack|pakke|pcs|pieces)\b/i);
  if (packMatch) {
    const count = parseInt(packMatch[1], 10);
    if (count > 1 && count <= 100) {
      extracted["Antall"] = `${count} stk`;
    }
  }

  // Existing specs (from the scraper) always win
  return { ...extracted, ...existingSpecs };
}

/**
 * Detect package contents from title/description text.
 * Returns a list of content lines, e.g. ["3 x kameralinsebeskytter",
 * "1 x rengjøringsklut"]. Empty array if nothing detected.
 */
export function detectPackageContents(title: string, description: string): string[] {
  const text = `${title}\n${description}`.toLowerCase();
  const contents: string[] = [];

  const packMatch = text.match(/\b(\d+)\s*[- ]?\s*(?:stk|pk|pack|pakke|pcs|pieces)\b/i);
  const packCount = packMatch ? parseInt(packMatch[1], 10) : null;

  // Main product line
  const productType = detectProductType(title);
  if (packCount && packCount > 1) {
    contents.push(`${packCount} x ${productType}`);
  } else {
    contents.push(`1 x ${productType}`);
  }

  // Common included accessories
  const accessories: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /rengjøringsklut|cleaning\s+cloth|mikrofiberklut/i, label: "1 x rengjøringsklut" },
    { pattern: /støvfjerner|dust\s+(?:sticker|remover)|støvklistremerke/i, label: "1 x støvfjerner" },
    { pattern: /våtserviett|wet\s+wipe|alkoholserviett|alcohol\s+pad/i, label: "1 x våtserviett" },
    { pattern: /monteringsramme|installation\s+frame|alignment\s+frame|posisjoneringsramme/i, label: "1 x monteringsramme" },
    { pattern: /bruksanvisning|manual|installasjonsguide|installation\s+guide|veiledning/i, label: "1 x bruksanvisning" },
    { pattern: /ladekabel|charging\s+cable|usb[- ]kabel/i, label: "1 x ladekabel" },
    { pattern: /fjernkontroll|remote\s+control/i, label: "1 x fjernkontroll" },
    { pattern: /festeanordning|monteringssett|mounting\s+kit|skruer\b|screws\b/i, label: "1 x monteringssett" },
    { pattern: /bæreveske|carrying\s+(?:case|bag)|oppbevaringspose/i, label: "1 x oppbevaringspose" },
    { pattern: /klistremerke(?!.*støv)|sticker(?!.*dust)/i, label: "Klistremerker" },
  ];

  for (const { pattern, label } of accessories) {
    if (pattern.test(text) && !contents.includes(label)) {
      contents.push(label);
    }
  }

  return contents;
}

/** Best-effort product type in Norwegian for the contents line. */
function detectProductType(title: string): string {
  const lower = title.toLowerCase();
  const types: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /kameralinse|camera\s+lens/i, label: "kameralinsebeskytter" },
    { pattern: /skjermbeskytter|screen\s+protector/i, label: "skjermbeskytter" },
    { pattern: /deksel|case|cover/i, label: "deksel" },
    { pattern: /lader|charger/i, label: "lader" },
    { pattern: /kabel|cable/i, label: "kabel" },
    { pattern: /holder|stand|mount|stativ/i, label: "holder" },
    { pattern: /hodetelefon|headset|ørepropper|earbuds/i, label: "hodetelefoner" },
    { pattern: /høyttaler|speaker/i, label: "høyttaler" },
    { pattern: /lampe|lys|light/i, label: "lampe" },
    { pattern: /tastatur|keyboard/i, label: "tastatur" },
    { pattern: /\bmus\b|mouse/i, label: "mus" },
    { pattern: /hub\b/i, label: "USB-hub" },
    { pattern: /powerbank|power\s+bank/i, label: "powerbank" },
  ];

  for (const { pattern, label } of types) {
    if (pattern.test(lower)) return label;
  }
  return "produkt (som vist på bildene)";
}
