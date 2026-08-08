/**
 * Data Quality Engineer — catalog metadata audit + cleanup.
 * Does NOT change search logic or UI.
 *
 * Run: npx tsx scripts/dq-cleanup-metadata.ts [--apply]
 * Default is dry-run.
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import {
  detectSubcategory,
  normalizeLegacyCategory,
  normalizeSubcategory,
} from "../lib/categories/tree";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const STORE = "default-store";

type ProductRow = {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  tags: string;
  shortDescription: string | null;
};

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/-/g, " ")
    .replace(/[^\p{L}\p{N}\s,]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTags(raw: string): string[] {
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) {
      return p
        .map((t) => String(t).trim())
        .filter((t) => t.length > 0);
    }
  } catch {
    /* plain */
  }
  if (!raw || raw === "null" || raw === "[]") return [];
  return raw
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function stringifyTags(tags: string[]): string {
  return JSON.stringify([...new Set(tags.map((t) => t.trim()).filter(Boolean))]);
}

/** Split comma-blobs like "iphone, samsung, huawei" into atomic tags. */
function explodeTag(tag: string): string[] {
  if (tag.includes(",") || tag.includes(";")) {
    return tag
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [tag];
}

type ProductKind =
  | "mouse"
  | "mouse_pad"
  | "keyboard"
  | "headset"
  | "speaker"
  | "microphone"
  | "controller"
  | "charger"
  | "powerbank"
  | "cable"
  | "hub_dock"
  | "phone_case"
  | "tablet_case"
  | "tablet"
  | "laptop_stand"
  | "webcam"
  | "router_wifi"
  | "led"
  | "unknown";

function detectKind(name: string): ProductKind {
  const n = norm(name);

  if (/musematte|mouse\s*pad|mousepad|desk\s*mat|desk\s*pad/.test(n)) return "mouse_pad";
  if (
    /\bdatamus\b|\bgaming.?mus\b|\bspillmus\b|\bgamingmus\b/.test(n) ||
    (/(^|\s)(mus|mouse)(\s|$)/.test(n) &&
      !/musematte|mousepad|tastatur|keyboard|headset/.test(n))
  ) {
    return "mouse";
  }
  if (
    (/tastatur|keyboard/.test(n) &&
      !/dust\s*cover|dust\s*deksel|bench|chair|stol|pianos/.test(n)) ||
    /mekanisk tastatur|gaming.?tastatur/.test(n)
  ) {
    return "keyboard";
  }
  if (/headset|hodetelefon|earbuds|orepropper/.test(n)) return "headset";
  if (/hoyttaler|høyttaler|speaker|soundbar/.test(n)) return "speaker";
  if (/mikrofon|microphone|\bmic\b/.test(n)) return "microphone";
  if (/gamepad|controller|kontroller|joypad|spillkontroller/.test(n)) {
    return "controller";
  }
  if (/powerbank|nodlader|nødlader/.test(n)) return "powerbank";
  if (
    /\blader\b|\bcharger\b|hurtiglader|vegglader|billader|qi.?lader|tradlos lading|trådløs lading|magsafe/.test(
      n
    )
  ) {
    return "charger";
  }
  if (
    /(telefon|phone|iphone|samsung|galaxy|mobil).{0,24}(deksel|case|cover|etui)/.test(n) ||
    /(deksel|case|cover|etui).{0,24}(telefon|phone|iphone|samsung|galaxy|mobil)/.test(n) ||
    /personvern\s*deksel|mobildeksel|phone\s*case/.test(n)
  ) {
    return "phone_case";
  }
  if (
    /(nettbrett|tablet|ipad).{0,24}(deksel|case|cover|etui|mappe)/.test(n) ||
    /(deksel|case|cover|mappe).{0,24}(nettbrett|tablet|ipad)/.test(n)
  ) {
    return "tablet_case";
  }
  if (/dokking|docking|\bhub\b|dongle/.test(n)) return "hub_dock";
  if (/\bkabel\b|\bcable\b|ladekabel/.test(n) && !/holder|organizer|bag/.test(n)) {
    return "cable";
  }
  if (/webkamera|webcam/.test(n)) return "webcam";
  if (/wifi.?ruter|wi.?fi.?adapter|nettverkskort|router/.test(n)) return "router_wifi";
  if (/laptopstativ|laptop\s*stand/.test(n)) return "laptop_stand";
  if (/\bnettbrett\b|\btablet\b/.test(n) && !/deksel|case|stativ|mappe|holder/.test(n)) {
    return "tablet";
  }
  if (/^led(\s|$)|led.?list|led.?strip/.test(n)) return "led";
  return "unknown";
}

/** Tags that are almost always wrong for a given product kind. */
const FORBIDDEN_BY_KIND: Record<ProductKind, RegExp[]> = {
  mouse: [
    /^mobildeksel$/i,
    /^deksel$/i,
    /^phone\s*case$/i,
    /^iphone$/i,
    /^samsung$/i,
    /^galaxy$/i,
    /^ipad$/i,
    /^case$/i,
    /^cover$/i,
    /^etui$/i,
    /^bumper$/i,
    /^powerbank$/i,
    /^lader$/i,
    /^hurtiglader$/i,
  ],
  mouse_pad: [
    /^mobildeksel$/i,
    /^deksel$/i,
    /^phone\s*case$/i,
    /^iphone$/i,
    /^samsung$/i,
    /^galaxy$/i,
    /^ipad$/i,
    /^case$/i,
    /^cover$/i,
    /^etui$/i,
    /^lader$/i,
    /^hurtiglader$/i,
    /^powerbank$/i,
    /^charger$/i,
    /^wireless\s*charg/i,
    /^trådløs lading$/i,
    /^tradlos lading$/i,
    /^tastatur$/i,
    /^keyboard$/i,
  ],
  keyboard: [
    /^mobildeksel$/i,
    /^deksel$/i,
    /^phone\s*case$/i,
    /^iphone$/i,
    /^samsung$/i,
    /^galaxy$/i,
    /^powerbank$/i,
    /^lader$/i,
    /^hurtiglader$/i,
  ],
  headset: [/^mobildeksel$/i, /^deksel$/i, /^iphone$/i, /^samsung$/i, /^galaxy$/i],
  speaker: [
    /^mobildeksel$/i,
    /^deksel$/i,
    /^iphone$/i,
    /^samsung$/i,
    /^case$/i,
    /^powerbank$/i,
    /^lader$/i,
    /^hurtiglader$/i,
  ],
  microphone: [/^mobildeksel$/i, /^deksel$/i, /^iphone$/i, /^samsung$/i, /^galaxy$/i],
  controller: [/^mobildeksel$/i, /^deksel$/i, /^iphone$/i, /^samsung$/i],
  charger: [
    /^mobildeksel$/i,
    /^deksel$/i,
    /^phone\s*case$/i,
    /^etui$/i,
    /^case$/i,
    /^musematte$/i,
    /^mousepad$/i,
    /^tastatur$/i,
    /^keyboard$/i,
    /^gaming\s*mus$/i,
  ],
  powerbank: [
    /^mobildeksel$/i,
    /^deksel$/i,
    /^phone\s*case$/i,
    /^iphone\s*deksel$/i,
    /^etui$/i,
    /^case$/i,
    /^cover$/i,
    /^musematte$/i,
    /^tastatur$/i,
    /^keyboard$/i,
  ],
  cable: [/^mobildeksel$/i, /^deksel$/i, /^musematte$/i, /^tastatur$/i],
  hub_dock: [/^mobildeksel$/i, /^deksel$/i, /^iphone$/i, /^samsung$/i],
  phone_case: [],
  tablet_case: [],
  tablet: [/^mobildeksel$/i, /^deksel$/i, /^lader$/i],
  laptop_stand: [/^mobildeksel$/i, /^deksel$/i, /^iphone$/i, /^samsung$/i],
  webcam: [/^mobildeksel$/i, /^deksel$/i, /^iphone$/i, /^samsung$/i],
  router_wifi: [
    /^mobildeksel$/i,
    /^deksel$/i,
    /^iphone$/i,
    /^samsung$/i,
    /^galaxy$/i,
    /^bluetooth\s*høyttaler$/i,
    /^bluetooth\s*hoyttaler$/i,
  ],
  led: [/^mobildeksel$/i, /^deksel$/i, /^iphone$/i, /^samsung$/i],
  unknown: [],
};

/** Global junk / generic / meaningless tags */
const GLOBAL_JUNK: RegExp[] = [
  /^others$/i,
  /^other$/i,
  /^plastic$/i,
  /^metal$/i,
  /^cloth$/i,
  /^leather$/i,
  /^rubber$/i,
  /^null$/i,
  /^undefined$/i,
  /^n\/a$/i,
  /^test$/i,
  /^product$/i,
  /^produkt$/i,
  /^new$/i,
  /^hot$/i,
  /^best$/i,
  /^sale$/i,
  /^mobil\s*&\s*tilbehor$/i,
  /^mobil\s*&\s*tilbehør$/i,
  /^hjem\s*&\s*fritid$/i,
  /^data\s*&\s*it$/i,
  /^tv,?\s*lyd(\s*&\s*bilde)?$/i,
  /^cloth,?\s*plastic$/i,
  /^plastic,?\s*metal$/i,
  /^plastic,?\s*others$/i,
  /^metal,?\s*plastic$/i,
  /^metal,?\s*others$/i,
  /^plastic,?\s*metal,?\s*others$/i,
  /^-rechargeable$/i,
  /^000mah$/i,
];

/** Brand tags only allowed when brand appears in title (or short desc). */
const BRAND_TAGS = ["iphone", "samsung", "galaxy", "ipad", "apple", "huawei", "xiaomi", "sony", "logitech", "razer"];

function titleHasBrand(name: string, brand: string): boolean {
  const n = norm(name);
  const b = norm(brand);
  if (b === "apple") return /\bapple\b|\biphone\b|\bipad\b|\bmagsafe\b/.test(n);
  if (b === "samsung") return /\bsamsung\b|\bgalaxy\b/.test(n);
  if (b === "galaxy") return /\bgalaxy\b|\bsamsung\b/.test(n);
  return n.includes(b);
}

function expectedSubcategory(kind: ProductKind, category: string | null): string | null {
  const cat = category || "";
  switch (kind) {
    case "mouse":
      return cat === "Gaming" ? "Gamingmus" : cat === "Data & IT" ? "Tilbehør" : null;
    case "mouse_pad":
      return cat === "Gaming" ? "Musematter" : null;
    case "keyboard":
      if (cat === "Gaming") return "Tastatur";
      if (cat === "Data & IT") return "Tilbehør";
      return null;
    case "headset":
      return cat === "Gaming" ? "Headset" : cat === "TV, Lyd & Bilde" ? "Hodetelefoner" : null;
    case "speaker":
      return cat === "TV, Lyd & Bilde" ? "Høyttaler" : null;
    case "microphone":
      return cat === "TV, Lyd & Bilde" ? "Mikrofon" : null;
    case "controller":
      return cat === "Gaming" ? "Kontrollere" : null;
    case "charger":
      return cat === "Mobil & Tilbehør" ? "Lader" : null;
    case "powerbank":
      return cat === "Mobil & Tilbehør" ? "Powerbank" : null;
    case "cable":
      return cat === "Mobil & Tilbehør" ? "Kabel" : cat === "Data & IT" ? "Kabler" : null;
    case "hub_dock":
      return cat === "Data & IT" ? "Hub" : null;
    case "phone_case":
      return cat === "Mobil & Tilbehør" ? "Mobildeksel" : null;
    case "tablet_case":
      return cat === "Mobil & Tilbehør" ? "Mobildeksel" : cat === "Data & IT" ? "Tilbehør" : null;
    case "webcam":
      return cat === "Data & IT" ? "Tilbehør" : null;
    case "router_wifi":
      return cat === "Data & IT" || cat === "Mobil & Tilbehør" ? "Tilbehør" : null;
    case "laptop_stand":
      return cat === "Data & IT" ? "Laptop" : null;
    case "led":
      return cat === "Hjem & Fritid" ? "Belysning" : cat === "Gaming" ? "RGB" : null;
    case "tablet":
      return cat === "Data & IT" ? "Laptop" : null;
    default:
      return null;
  }
}

function refineChargerSub(name: string): string {
  const n = norm(name);
  if (/tradlos|trådløs|wireless|qi|magsafe/.test(n) && !/billader/.test(n)) {
    return "Trådløs lading";
  }
  return "Lader";
}

function refineHubSub(name: string): string {
  const n = norm(name);
  if (/dokking|docking|dock/.test(n)) return "Docking";
  return "Hub";
}

type Change = {
  id: string;
  name: string;
  kind: ProductKind;
  field: "tags" | "subcategory" | "category";
  before: string | null;
  after: string | null;
  reason: string;
};

function cleanTags(
  p: ProductRow,
  kind: ProductKind
): { tags: string[]; removed: Array<{ tag: string; reason: string }> } {
  const removed: Array<{ tag: string; reason: string }> = [];
  const raw = parseTags(p.tags);
  const exploded: string[] = [];
  for (const t of raw) {
    const parts = explodeTag(t);
    if (parts.length > 1) {
      removed.push({ tag: t, reason: "kopiert/blob-tag splittet" });
    }
    exploded.push(...parts);
  }

  const forbidden = FORBIDDEN_BY_KIND[kind] || [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const tag of exploded) {
    const t = tag.trim();
    if (!t) {
      removed.push({ tag: t, reason: "tom tag" });
      continue;
    }
    const key = norm(t);
    if (seen.has(key)) {
      removed.push({ tag: t, reason: "duplikat" });
      continue;
    }

    if (GLOBAL_JUNK.some((re) => re.test(t) || re.test(key))) {
      removed.push({ tag: t, reason: "generisk/junk" });
      continue;
    }

    // Material composites already partly in GLOBAL_JUNK
    if (/^(plastic|metal|cloth|leather|rubber)(,|$)/i.test(t) && t.includes(",")) {
      removed.push({ tag: t, reason: "generisk material-blob" });
      continue;
    }

    if (forbidden.some((re) => re.test(t) || re.test(key))) {
      removed.push({ tag: t, reason: `irrelevant for ${kind}` });
      continue;
    }

    // Brand tags without brand in title
    const brandHit = BRAND_TAGS.find((b) => key === b || key.includes(b));
    if (brandHit && !titleHasBrand(p.name, brandHit)) {
      // Also block "iphone, samsung, huawei" style already exploded
      removed.push({ tag: t, reason: `brand-tag uten brand i tittel (${brandHit})` });
      continue;
    }

    // Compatibility list tags that are just brand lists
    if (/iphone.*samsung|samsung.*huawei|iphone.*huawei/i.test(t)) {
      removed.push({ tag: t, reason: "generisk kompatibilitetsliste" });
      continue;
    }

    // Case tags on non-cases
    if (
      kind !== "phone_case" &&
      kind !== "tablet_case" &&
      /^(mobildeksel|deksel|phone case|etui|case|cover|bumper)$/i.test(t)
    ) {
      removed.push({ tag: t, reason: "case-tag på ikke-deksel" });
      continue;
    }

    // Subcategory echoed as tag that contradicts kind
    if (key === "mobildeksel" && kind !== "phone_case" && kind !== "tablet_case") {
      removed.push({ tag: t, reason: "feil subcategory-tag" });
      continue;
    }

    // Echo of main category as tag (already covered) — also drop lone subcategory
    // echoes ONLY when they contradict product kind (handled via forbidden).

    // Keep Bluetooth / USB / RGB / wireless — useful attributes
    seen.add(key);
    out.push(t);
  }

  return { tags: out, removed };
}

function fixCategory(
  p: ProductRow,
  kind: ProductKind
): { next: string; reason: string } | null {
  const cat = p.category || "";
  const n = norm(p.name);

  if (
    (kind === "keyboard" || kind === "mouse" || kind === "mouse_pad") &&
    cat === "Mobil & Tilbehør"
  ) {
    if (kind === "mouse_pad" || /gaming|rgb|mekanisk/.test(n)) {
      return { next: "Gaming", reason: `${kind} feilplassert i Mobil & Tilbehør` };
    }
    if (kind === "mouse") {
      return { next: "Gaming", reason: "mus feilplassert i Mobil & Tilbehør" };
    }
    return { next: "Data & IT", reason: "tastatur feilplassert i Mobil & Tilbehør" };
  }

  if (kind === "controller" && cat === "Mobil & Tilbehør") {
    return { next: "Gaming", reason: "kontroller feilplassert i Mobil & Tilbehør" };
  }

  if (kind === "speaker" && cat === "Mobil & Tilbehør") {
    return { next: "TV, Lyd & Bilde", reason: "høyttaler feilplassert i Mobil" };
  }

  if (
    (kind === "phone_case" || kind === "charger" || kind === "powerbank") &&
    cat === "Gaming" &&
    !/gaming/.test(n)
  ) {
    return {
      next: "Mobil & Tilbehør",
      reason: `${kind} feilplassert i Gaming`,
    };
  }

  return null;
}

function fixSubcategory(
  p: ProductRow,
  kind: ProductKind
): { next: string | null; reason: string } | null {
  const main = normalizeLegacyCategory(p.category) || p.category;
  const current = p.subcategory;

  // Wrong Mobildeksel on non-cases
  if (
    current &&
    norm(current) === "mobildeksel" &&
    kind !== "phone_case" &&
    kind !== "tablet_case"
  ) {
    let next: string | null =
      kind === "charger"
        ? refineChargerSub(p.name)
        : kind === "hub_dock"
          ? refineHubSub(p.name)
          : expectedSubcategory(kind, main);

    // Prefer tree detect from title when unknown
    if (kind === "unknown" && main) {
      next = detectSubcategory(main, p.name) || null;
    }

    if (next) {
      const normalized = main ? normalizeSubcategory(main, next) || next : next;
      // Only set if valid under main; else null
      if (main && !normalizeSubcategory(main, normalized) && normalized !== next) {
        return { next: null, reason: "fjernet feil Mobildeksel (ukjent gyldig sub)" };
      }
      // If normalized sub not valid for this main, clear
      if (main && next && !normalizeSubcategory(main, next) && !normalizeSubcategory(main, normalized)) {
        // try detect
        const detected = detectSubcategory(main, p.name);
        return {
          next: detected,
          reason: `feil Mobildeksel → ${detected || "null"} (fra tittel)`,
        };
      }
      return {
        next: main ? normalizeSubcategory(main, next) || next : next,
        reason: `feil Mobildeksel for ${kind}`,
      };
    }
    return { next: null, reason: `fjernet feil Mobildeksel for ${kind}` };
  }

  // Powerbank subcategory on speakers etc.
  if (current && norm(current) === "powerbank" && kind === "speaker") {
    return { next: "Høyttaler", reason: "Høyttaler feilmerket Powerbank" };
  }
  if (current && norm(current) === "tradlos lading" && kind === "mouse_pad") {
    return { next: "Musematter", reason: "Musematte feilmerket Trådløs lading" };
  }
  if (current && norm(current) === "tradlos lading" && kind === "keyboard") {
    return { next: "Tastatur", reason: "Tastatur feilmerket Trådløs lading" };
  }
  if (current && norm(current) === "kabel" && kind === "controller") {
    return { next: "Kontrollere", reason: "Kontroller feilmerket Kabel" };
  }
  if (current && norm(current) === "tastatur" && kind === "mouse") {
    return {
      next: main === "Gaming" ? "Gamingmus" : "Tilbehør",
      reason: "Mus feilmerket Tastatur",
    };
  }

  // Missing strong subcategory when we know kind well
  if (!current && kind !== "unknown") {
    let next = expectedSubcategory(kind, main);
    if (kind === "charger") next = refineChargerSub(p.name);
    if (kind === "hub_dock") next = refineHubSub(p.name);
    if (next && main) {
      const normalized = normalizeSubcategory(main, next);
      if (normalized) {
        return { next: normalized, reason: `satte manglende sub fra kind=${kind}` };
      }
    }
  }

  return null;
}

async function main() {
  const products = await prisma.product.findMany({
    where: {
      storeId: STORE,
      // Clean all catalog rows including inactive — user said whole catalog
    },
    select: {
      id: true,
      name: true,
      category: true,
      subcategory: true,
      tags: true,
      shortDescription: true,
      isActive: true,
    },
  });

  const changes: Change[] = [];
  const tagRemovalLog: Array<{
    id: string;
    name: string;
    kind: string;
    removed: Array<{ tag: string; reason: string }>;
  }> = [];

  let updates = 0;

  for (const p of products) {
    const kind = detectKind(p.name);
    const tagResult = cleanTags(p, kind);
    const beforeTags = stringifyTags(parseTags(p.tags));
    // Re-parse original for comparison of semantic equality
    const afterTags = stringifyTags(tagResult.tags);

    if (tagResult.removed.length > 0 || beforeTags !== afterTags) {
      // Also handle empty → []
      const origEmpty = !p.tags || p.tags === "[]" || p.tags === "";
      if (tagResult.removed.length > 0 || (origEmpty && tagResult.tags.length === 0)) {
        if (tagResult.removed.length > 0) {
          tagRemovalLog.push({
            id: p.id,
            name: p.name,
            kind,
            removed: tagResult.removed,
          });
          changes.push({
            id: p.id,
            name: p.name,
            kind,
            field: "tags",
            before: p.tags,
            after: afterTags,
            reason: tagResult.removed.map((r) => `${r.tag} (${r.reason})`).join("; "),
          });
        }
      } else if (beforeTags !== afterTags) {
        changes.push({
          id: p.id,
          name: p.name,
          kind,
          field: "tags",
          before: p.tags,
          after: afterTags,
          reason: "normalisert/deduplisert",
        });
      }
    }

    const catFix = fixCategory(p, kind);
    // Apply category first so subcategory normalization uses new main
    const effectiveCategory = catFix?.next || p.category;
    const pForSub = { ...p, category: effectiveCategory };
    const subFix = fixSubcategory(pForSub, kind);

    const data: {
      tags?: string;
      subcategory?: string | null;
      category?: string;
    } = {};

    if (catFix && catFix.next !== p.category) {
      data.category = catFix.next;
      changes.push({
        id: p.id,
        name: p.name,
        kind,
        field: "category",
        before: p.category,
        after: catFix.next,
        reason: catFix.reason,
      });
    }

    const beforeSet = parseTags(p.tags)
      .flatMap(explodeTag)
      .map(norm)
      .sort()
      .join("|");
    const afterSet = tagResult.tags.map(norm).sort().join("|");
    if (beforeSet !== afterSet) {
      data.tags = afterTags;
    }

    if (subFix && subFix.next !== p.subcategory) {
      // Re-validate against effective category
      let nextSub = subFix.next;
      if (nextSub && effectiveCategory) {
        nextSub =
          normalizeSubcategory(effectiveCategory, nextSub) ||
          detectSubcategory(effectiveCategory, p.name) ||
          null;
      }
      if (nextSub !== p.subcategory) {
        data.subcategory = nextSub;
        changes.push({
          id: p.id,
          name: p.name,
          kind,
          field: "subcategory",
          before: p.subcategory,
          after: nextSub,
          reason: subFix.reason,
        });
      }
    } else if (data.category && p.subcategory) {
      // Category changed — drop invalid subcategory
      const ok =
        effectiveCategory &&
        normalizeSubcategory(effectiveCategory, p.subcategory);
      if (!ok) {
        const detected =
          (effectiveCategory && detectSubcategory(effectiveCategory, p.name)) ||
          expectedSubcategory(kind, effectiveCategory);
        const nextSub =
          (detected &&
            effectiveCategory &&
            normalizeSubcategory(effectiveCategory, detected)) ||
          detected ||
          null;
        data.subcategory = nextSub;
        changes.push({
          id: p.id,
          name: p.name,
          kind,
          field: "subcategory",
          before: p.subcategory,
          after: nextSub,
          reason: "sub ugyldig etter kategori-endring",
        });
      }
    }

    if (Object.keys(data).length > 0) {
      updates += 1;
      if (APPLY) {
        await prisma.product.update({
          where: { id: p.id },
          data,
        });
      }
    }
  }

  // Summary stats
  const byField: Record<string, number> = {};
  const byReasonBucket: Record<string, number> = {};
  for (const c of changes) {
    byField[c.field] = (byField[c.field] || 0) + 1;
    const bucket = c.reason.split(";")[0]?.slice(0, 60) || c.reason;
    byReasonBucket[bucket] = (byReasonBucket[bucket] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? "APPLY" : "DRY_RUN",
    catalogSize: products.length,
    productsUpdated: updates,
    changeCount: changes.length,
    byField,
    sampleChanges: changes.slice(0, 80),
    allSubcategoryChanges: changes.filter((c) => c.field === "subcategory"),
    tagRemovalsSample: tagRemovalLog.slice(0, 60),
    tagRemovalProductCount: tagRemovalLog.length,
  };

  fs.writeFileSync(
    "scripts/.dq-metadata-report.json",
    JSON.stringify({ ...report, allChanges: changes, allTagRemovals: tagRemovalLog }, null, 2),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        catalogSize: report.catalogSize,
        productsUpdated: report.productsUpdated,
        changeCount: report.changeCount,
        byField: report.byField,
        subcategoryFixes: report.allSubcategoryChanges.length,
        tagProductsTouched: report.tagRemovalProductCount,
      },
      null,
      2
    )
  );
  console.log("WROTE scripts/.dq-metadata-report.json");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
