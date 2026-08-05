/**
 * Filter and present product specifications for storefront customers.
 * Strips supplier/CJ internal metadata and Chinese-only fields.
 */

const BLOCKED_KEY_PATTERNS: RegExp[] = [
  /\(zh\)/i,
  /\bzhs?\b/i,
  /packaging\s*key/i,
  /material\s*key/i,
  /customs/i,
  /hs\s*code/i,
  /entry\s*(code|name)/i,
  /category\s*id/i,
  /supplier\s*(id|name)/i,
  /\bstatus\b/i,
  /listed\s*count/i,
  /listed\s*num/i,
  /free\s*shipping\s*flag/i,
  /add\s*mark/i,
  /suggest(ed)?\s*sell/i,
  /product\s*id/i,
  /\bpid\b/i,
  /logistics\s*attributes/i,
  /option\s*keys?/i,
  /warehouse/i,
  /vid\b/i,
  /variant\s*sku/i,
  /barcode2?/i,
  /packing\s*key/i,
  /product\s*key/i,
  /product\s*pro/i,
  /packing\s*weight/i,
  /volume/i,
  /currency/i,
  /cost/i,
  /margin/i,
  /supplier/i,
  /cj\b/i,
  /temu/i,
  /dropship/i,
  /raw\b/i,
  /internal/i,
  /sku$/i, // bare SKU often supplier-facing; keep "Artikkelnummer" via allow rename
];

/** Keys that are always customer-safe when present (after rename). */
const KEY_ALIASES: Record<string, string> = {
  material: "Materiale",
  "material name": "Materiale",
  "material name en": "Materiale",
  weight: "Vekt",
  "weight (g)": "Vekt",
  "product weight": "Vekt",
  color: "Farge",
  colour: "Farge",
  farge: "Farge",
  size: "Størrelse",
  størrelse: "Størrelse",
  dimensions: "Dimensjoner",
  dimension: "Dimensjoner",
  length: "Lengde",
  width: "Bredde",
  height: "Høyde",
  compatibility: "Kompatibilitet",
  kompatibilitet: "Kompatibilitet",
  battery: "Batteri",
  batteri: "Batteri",
  voltage: "Spenning",
  spenning: "Spenning",
  power: "Effekt",
  effekt: "Effekt",
  watt: "Effekt",
  connector: "Tilkobling",
  connection: "Tilkobling",
  tilkobling: "Tilkobling",
  interface: "Tilkobling",
  ip: "IP-grad",
  "ip rating": "IP-grad",
  "ip-grad": "IP-grad",
  warranty: "Garanti",
  garanti: "Garanti",
  packaging: "Emballasje",
  packing: "Emballasje",
  "product type": "Produkttype",
  unit: "Enhet",
  category: "Kategori",
  kapasitet: "Kapasitet",
  capacity: "Kapasitet",
  length_cm: "Lengde",
  cable: "Kabel",
  model: "Modell",
  brand: "Merke",
  merke: "Merke",
};

const GROUP_ORDER = [
  "Materialer",
  "Dimensjoner",
  "Kompatibilitet",
  "Teknisk",
  "Levering",
  "Annet",
] as const;

export type SpecGroupName = (typeof GROUP_ORDER)[number];

export type CustomerSpec = {
  key: string;
  value: string;
  group: SpecGroupName;
};

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function isBlockedKey(key: string): boolean {
  const n = normalizeKey(key);
  return BLOCKED_KEY_PATTERNS.some((re) => re.test(n) || re.test(key));
}

function isBlockedValue(key: string, value: string): boolean {
  if (/^ORDINARY_PRODUCT$/i.test(value)) return true;
  if (/^[A-Z0-9_]{12,}$/.test(value) && /type|status|id/i.test(key)) return true;
  // CJ English category breadcrumb dump
  if (/>/.test(value) && /phones|accessories|cases|covers/i.test(value)) return true;
  return false;
}

function renameKey(key: string): string {
  const n = normalizeKey(key);
  if (KEY_ALIASES[n]) return KEY_ALIASES[n];
  // Title-case leftover English keys lightly
  if (/^[a-z0-9\s()]+$/i.test(key) && !/[æøå]/i.test(key)) {
    return key
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\s+/g, " ");
  }
  return key.trim();
}

function formatValue(key: string, value: string): string {
  let v = value.trim();
  if (!v || v === "null" || v === "undefined") return "";
  if (hasChinese(v) && !/[a-zæøå0-9]/i.test(v)) return ""; // pure Chinese

  const nk = normalizeKey(key);
  if ((nk.includes("weight") || nk === "vekt") && /^\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (n >= 1000) v = `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} kg`;
    else v = `${n} g`;
  }
  const materialMap: Record<string, string> = {
    plastic: "Plast",
    "plastic bags": "Plastpose",
    silicone: "Silikon",
    silicon: "Silikon",
    tpu: "TPU",
  };
  if (nk.includes("material") || nk.includes("emballasje") || nk.includes("packaging") || nk.includes("packing")) {
    v = materialMap[v.toLowerCase()] || v;
  }
  return v;
}

function groupForKey(key: string): SpecGroupName {
  const n = normalizeKey(key);
  if (/material|stoff|plast|aluminium|silikon|lær|glass|metall|emballasje/.test(n)) {
    return "Materialer";
  }
  if (/dimens|mål|lengde|bredde|høyde|vekt|size|størrelse|cm|mm|kg/.test(n)) {
    return "Dimensjoner";
  }
  if (/kompat|passer|modell|device|iphone|samsung|android/.test(n)) {
    return "Kompatibilitet";
  }
  if (
    /batteri|spenning|effekt|watt|volt|amp|ip-?grad|tilkobling|usb|hdmi|wifi|bluetooth|frekvens|hastighet|kapasitet|teknisk/.test(
      n
    )
  ) {
    return "Teknisk";
  }
  if (/garanti|levering|frakt|lager|pakke/.test(n)) {
    return "Levering";
  }
  return "Annet";
}

/**
 * Convert raw product.specs into customer-safe grouped rows.
 */
export function toCustomerSpecs(
  raw: Record<string, string> | null | undefined,
  extras?: Record<string, string>
): CustomerSpec[] {
  const source = { ...(raw || {}), ...(extras || {}) };
  const seen = new Set<string>();
  const out: CustomerSpec[] = [];

  for (const [rawKey, rawValue] of Object.entries(source)) {
    if (isBlockedKey(rawKey)) continue;
    const value = formatValue(rawKey, String(rawValue ?? ""));
    if (!value || hasChinese(value) && value.length < 4) continue;
    if (hasChinese(rawKey)) continue;
    if (isBlockedValue(rawKey, value)) continue;

    const key = renameKey(rawKey);
    if (isBlockedKey(key)) continue;
    const dedupe = normalizeKey(key);
    if (seen.has(dedupe)) continue;
    // Drop bare supplier SKU / numeric IDs presented as "SKU" / "Product Id"
    if (/^(sku|product id|artikkelnummer)$/i.test(key) && /^[A-Z0-9_-]{8,}$/i.test(value)) {
      continue;
    }
    seen.add(dedupe);
    out.push({ key, value, group: groupForKey(key) });
  }

  out.sort((a, b) => {
    const gi = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    if (gi !== 0) return gi;
    return a.key.localeCompare(b.key, "nb");
  });

  return out;
}

export function groupCustomerSpecs(specs: CustomerSpec[]): Array<{
  group: SpecGroupName;
  items: CustomerSpec[];
}> {
  const map = new Map<SpecGroupName, CustomerSpec[]>();
  for (const spec of specs) {
    const list = map.get(spec.group) || [];
    list.push(spec);
    map.set(spec.group, list);
  }
  return GROUP_ORDER.filter((g) => map.has(g)).map((group) => ({
    group,
    items: map.get(group)!,
  }));
}

export function customerSpecsToRecord(specs: CustomerSpec[]): Record<string, string> {
  return Object.fromEntries(specs.map((s) => [s.key, s.value]));
}
