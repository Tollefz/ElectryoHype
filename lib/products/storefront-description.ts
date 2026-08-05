/**
 * Build customer-facing Norwegian product copy from real product signals.
 * Avoids generic filler ("praktisk produkt", "tilpasset daglig bruk").
 */

import { toCustomerSpecs, type CustomerSpec } from "@/lib/products/customer-specs";

const GENERIC_PATTERNS: RegExp[] = [
  /praktisk produkt/i,
  /tilpasset daglig bruk/i,
  /god verdi for pengene/i,
  /kvalitetsprodukt innen/i,
  /enkel[t]? i bruk og rask levering/i,
  /del av vårt utvalg av elektronikk/i,
  /fokus på funksjonalitet og verdi/i,
  /passer til flere bruksområder/i,
  /kompakt og praktisk design/i,
];

export function isGenericDescription(text: string | null | undefined): boolean {
  if (!text || !text.trim()) return true;
  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (plain.length < 40) return true;
  if (GENERIC_PATTERNS.some((re) => re.test(plain))) return true;
  // Mostly filler benefits list without product-specific nouns
  if (
    /enkel å bruke i hverdagen/i.test(plain) &&
    /god verdi for pengene/i.test(plain)
  ) {
    return true;
  }
  return false;
}

type ProductType =
  | "phone_case"
  | "screen_protector"
  | "cable"
  | "charger"
  | "powerbank"
  | "mouse"
  | "keyboard"
  | "headset"
  | "speaker"
  | "hub"
  | "led"
  | "holder"
  | "generic";

function detectProductType(title: string, category: string): ProductType {
  const t = `${title} ${category}`.toLowerCase();
  // Order matters: more specific phrases before broad keywords
  if (/wrist\s*rest|musematte|mouse\s*pad|desk\s*pad/i.test(t)) return "generic";
  if (/deksel|phone\s*case|protective\s*shell|(?<!mouse\s)cover|etui|suction.*phone|phone.*case/i.test(t) && !/mouse\s*pad|desk\s*pad|charger/i.test(t))
    return "phone_case";
  if (/skjermbeskytter|screen protector|herdet glass|tempered|privacy\s*glass/i.test(t) && /glass|protector|beskytter/i.test(t))
    return "screen_protector";
  if (/ladekabel|charging cable|\bkabel\b|cable|usb-c.*cord/i.test(t) && !/pad|matte/i.test(t)) return "cable";
  if (/charging\s*station|hurtiglader|vegglader|wireless\s*charger|\blader\b|charger|adapter/i.test(t) && !/kabel|cable|mouse\s*pad|desk\s*pad/i.test(t))
    return "charger";
  if (/powerbank|nødlader/i.test(t)) return "powerbank";
  if (/(?<!desk\s)(?<!mouse\s)\bmus\b|(?<!pad)mouse(?!\s*pad)|gaming\s*mus|gamingmus|wireless\s*mouse/i.test(t) && !/pad|matte|wrist/i.test(t))
    return "mouse";
  if (/tastatur|keyboard/i.test(t)) return "keyboard";
  if (/ørepropper|earbuds|hodetelefon|headset|earphones|earphone|ear\s*clip|bone\s*conduction/i.test(t))
    return "headset";
  if (/høyttaler|speaker/i.test(t)) return "speaker";
  if (/\bhub\b|dock|dongle/i.test(t)) return "hub";
  if (/\bled\b|stripelys|belysning|ambient\s*light/i.test(t) && !/mus|mouse|tastatur|keyboard|headset|earphone/i.test(t))
    return "led";
  if (/\bholder\b|\bmount\b|\bstativ\b|(?<![a-z])stand(?!by)/i.test(t)) return "holder";
  return "generic";
}

function humanizeMaterial(value: string): string {
  const map: Record<string, string> = {
    plastic: "plast",
    "plastic bags": "plastpose",
    silicone: "silikon",
    silicon: "silikon",
    tpu: "TPU",
    pc: "polykarbonat",
    abs: "ABS",
    aluminum: "aluminium",
    aluminium: "aluminium",
    leather: "lær",
    metal: "metall",
    glass: "glass",
    fabric: "stoff",
  };
  return map[value.trim().toLowerCase()] || value;
}

function introForType(
  type: ProductType,
  title: string,
  specs: CustomerSpec[],
  category: string
): string {
  const materialRaw = specs.find((s) => /materiale/i.test(s.key))?.value;
  const material = materialRaw ? humanizeMaterial(materialRaw) : undefined;
  const compat = specs.find((s) => /kompat/i.test(s.key))?.value;
  const color = specs.find((s) => /farge/i.test(s.key))?.value;

  switch (type) {
    case "phone_case":
      return [
        "Perfekt for deg som ønsker ekstra beskyttelse uten å gjøre telefonen klumpete.",
        /magnet|magsafe|magnetic/i.test(title)
          ? "Kompatibel med MagSafe og magnetiske ladere/holdere."
          : null,
        material ? `Laget av ${material.toLowerCase()}.` : null,
        compat ? `Passer til ${compat}.` : null,
      ]
        .filter(Boolean)
        .join(" ");
    case "screen_protector":
      return [
        "Beskytter skjermen mot riper, støt og fingeravtrykk uten å påvirke berøringsfølsomheten.",
        material?.toLowerCase().includes("glass")
          ? "Herdet glass gir klar sikt og solid overflatebeskyttelse."
          : null,
        compat ? `Tilpasset ${compat}.` : null,
      ]
        .filter(Boolean)
        .join(" ");
    case "cable":
      return [
        "Stabil data- og strømoverføring med slitesterk kabelkonstruksjon.",
        /usb-?c|type-?c/i.test(title) ? "USB-C-tilkobling for moderne telefoner, nettbrett og laptoper." : null,
        material ? `Ytterkappe i ${material.toLowerCase()}.` : null,
      ]
        .filter(Boolean)
        .join(" ");
    case "charger":
      return [
        "Pålitelig lading med stabil strømforsyning til telefon, nettbrett og andre USB-enheter.",
        /gan|pd|pps|qc/i.test(title) ? "Støtter moderne hurtigladestandarder når enheten tillater det." : null,
      ]
        .filter(Boolean)
        .join(" ");
    case "powerbank":
      return [
        "Portabel ekstra strøm når du er på farten.",
        specs.find((s) => /kapasitet|mah|wh/i.test(s.key + s.value))
          ? `Kapasitet: ${specs.find((s) => /kapasitet|mah|wh/i.test(s.key + s.value))!.value}.`
          : null,
      ]
        .filter(Boolean)
        .join(" ");
    case "mouse":
      return "Høy presisjon og ergonomisk form gjør musen godt egnet til både gaming og produktivitet.";
    case "keyboard":
      return "Responsivt tastatur designet for komfortabel skriving og effektiv bruk ved pulten.";
    case "headset":
      return "Klar lyd og komfortabel passform for musikk, samtaler og underholdning.";
    case "speaker":
      return "Kompakt høyttaler for musikk og podcast – enkel å ta med og rask å koble til.";
    case "hub":
      return "Utvider tilkoblingsmulighetene slik at du kan koble flere enheter til laptop eller nettbrett.";
    case "led":
      return "Jevn belysning for skrivebord, oppsett eller stemning – enkel montering og lavt strømforbruk.";
    case "holder":
      return "Stabil festing som holder enheten på plass under bruk i bil, på pult eller på farten.";
    default: {
      const cat = category?.trim() || "elektronikk";
      const bits = [
        material ? `Materiale: ${material}.` : null,
        color ? `Farge: ${color}.` : null,
        compat ? `Kompatibilitet: ${compat}.` : null,
      ].filter(Boolean);
      if (/wrist|gel|silikon|silicon/i.test(title) && /rest|pad|støtte/i.test(title)) {
        return [
          "Gir støtte og demping under bruk ved skrivebordet.",
          material ? `Laget av ${material.toLowerCase()}.` : "Mykt, sklisikkert underlag.",
        ]
          .filter(Boolean)
          .join(" ");
      }
      if (/mouse\s*pad|musematte|desk\s*pad/i.test(title)) {
        return [
          "Stor, jevn overflate for mus og tastatur – ryddigere og mer behagelig arbeidsplass.",
          /rgb|led/i.test(title) ? "Med belysning for synlig oppsett." : null,
          /wireless\s*charg|trådløs lad/i.test(title)
            ? "Integrert trådløs lading der det er oppgitt."
            : null,
        ]
          .filter(Boolean)
          .join(" ");
      }
      if (bits.length > 0) {
        return `${bits.join(" ")} Se spesifikasjoner for tekniske detaljer.`;
      }
      const top = specs.slice(0, 3).map((s) => `${s.key}: ${s.value}`);
      if (top.length) {
        return top.join(". ") + ".";
      }
      return `Produkt i kategorien ${cat}. Se spesifikasjoner og bilder for detaljer.`;
    }
  }
}

function benefitsForType(type: ProductType, specs: CustomerSpec[], title: string): string[] {
  const fromSpecs = specs.slice(0, 3).map((s) => `${s.key}: ${s.value}`);
  const base: Record<ProductType, string[]> = {
    phone_case: [
      "Støtabsorberende beskyttelse",
      /magnet|magsafe|magnetic/i.test(title)
        ? "Kompatibel med MagSafe"
        : "Godt grep i hverdagsbruk",
      "Lett materiale",
      "Beskytter kamera",
      "Enkel montering",
    ],
    screen_protector: [
      "Klar sikt uten forstyrrelser",
      "Beskytter mot riper",
      "Enkel installasjon",
    ],
    cable: ["Slitesterk konstruksjon", "Stabil lading og dataoverføring", "Fleksibel i bruk"],
    charger: ["Stabil strømforsyning", "Kompakt design", "Passer flere enheter"],
    powerbank: ["Lading på farten", "Kompakt å ha med", "Flere ladeporter der det er oppgitt"],
    mouse: ["Presis sporing", "Ergonomisk form", "Passer gaming og kontor"],
    keyboard: ["Komfortabel skriving", "Stabil respons", "Passer hjemmekontor"],
    headset: ["Klar lyd", "Komfortabel passform", "Praktisk til hverdagsbruk"],
    speaker: ["Portabel lyd", "Enkel tilkobling", "Kompakt format"],
    hub: ["Flere porter", "Enkel Plug & Play", "Ryddigere skrivebord"],
    led: ["Jevn belysning", "Lavt strømforbruk", "Enkel montering"],
    holder: ["Stabil festing", "Justerbar vinkel der det er oppgitt", "Enkel montering"],
    generic: fromSpecs.length
      ? fromSpecs
      : ["Se spesifikasjoner for tekniske detaljer", "Bilder viser faktisk produkt", "Leveres med standard emballasje"],
  };
  const list = [...base[type]];
  // Prefer real spec lines when available
  for (const s of fromSpecs) {
    if (list.length >= 5) break;
    if (!list.some((l) => l.includes(s.split(":")[0]))) list.push(s);
  }
  return list.slice(0, 5);
}

export type StorefrontDescriptionInput = {
  title: string;
  category?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  specs?: Record<string, string> | null;
};

export type StorefrontDescription = {
  shortText: string;
  html: string;
  usedGenerated: boolean;
};

function useCasesForType(type: ProductType): string[] {
  const map: Record<ProductType, string[]> = {
    phone_case: [
      "Hverdagsbruk og pendling",
      "Beskyttelse i veske eller lomme",
      "Magnetiske ladere og bilholdere der dekselet støtter det",
    ],
    screen_protector: [
      "Daglig skjermbruk",
      "Beskyttelse mot riper i lomme og veske",
      "Bevare klar sikt under streaming og arbeid",
    ],
    cable: [
      "Lading hjemme og på kontoret",
      "Dataoverføring mellom enheter",
      "Reise og midlertidige oppsett",
    ],
    charger: [
      "Hurtiglading ved skrivebordet",
      "Nattlading ved sengen",
      "Flere enheter i hjemmet",
    ],
    powerbank: [
      "Reise og pendling",
      "Ekstra strøm uten stikkontakt",
      "Backup under lange dager",
    ],
    mouse: [
      "Gaming og produktivitet",
      "Hjemmekontor",
      "Bærbar bruk med laptop",
    ],
    keyboard: ["Skriving og kontor", "Hjemmekontor", "Spill der layouten tillater det"],
    headset: ["Musikk og podcast", "Samtaler og møter", "Gaming og underholdning"],
    speaker: ["Musikk hjemme", "Uteliv og reise", "Enkel trådløs lytting"],
    hub: ["Utvid porte på laptop", "Ryddigere skrivebord", "Dokking av flere enheter"],
    led: ["Skrivebordsbelysning", "Stemningslys", "Oppsett for streaming eller gaming"],
    holder: ["Bil og navigasjon", "Skrivebord og handsfree", "Filming og samtaler"],
    generic: [
      "Hverdagsbruk hjemme",
      "Kontor og studie",
      "Som vist på produktbildene",
    ],
  };
  return map[type];
}

/**
 * Always build ElectroHypeX description sections — never dump supplier HTML.
 */
export function buildStorefrontDescription(
  input: StorefrontDescriptionInput
): StorefrontDescription {
  const title = input.title || "Produkt";
  const category = input.category || "Elektronikk";
  const specs = toCustomerSpecs(input.specs);
  const type = detectProductType(title, category);

  const existingShort = input.shortDescription?.trim() || "";
  const shortIsGeneric = isGenericDescription(existingShort);

  const intro = introForType(type, title, specs, category);
  const benefits = benefitsForType(type, specs, title);
  const useCases = useCasesForType(type);

  const shortText =
    !shortIsGeneric && existingShort
      ? existingShort.slice(0, 220)
      : intro.slice(0, 220);

  const techLines = specs.slice(0, 8);
  const parts: string[] = [];
  parts.push(`<p>${escapeHtml(intro)}</p>`);

  parts.push("<h3>Fordeler</h3><ul>");
  for (const b of benefits) {
    parts.push(`<li>${escapeHtml(b)}</li>`);
  }
  parts.push("</ul>");

  parts.push("<h3>Bruksområder</h3><ul>");
  for (const u of useCases) {
    parts.push(`<li>${escapeHtml(u)}</li>`);
  }
  parts.push("</ul>");

  if (techLines.length > 0) {
    parts.push("<h3>Tekniske spesifikasjoner</h3><ul>");
    for (const s of techLines) {
      parts.push(`<li><strong>${escapeHtml(s.key)}:</strong> ${escapeHtml(s.value)}</li>`);
    }
    parts.push("</ul>");
  }

  parts.push("<h3>Levering</h3>");
  parts.push(
    "<p>Estimert leveringstid 5–12 virkedager. Fri frakt på ordre over 500 kr.</p>"
  );

  return {
    shortText,
    html: parts.join("\n"),
    usedGenerated: true,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
