import "server-only";

import { getAllDbValues } from "@/lib/categories";
import { formatProductDescription } from "@/lib/import/format-description";
import { generateProductSlug } from "@/lib/import/product-slug";
import { detectPackageContents, extractSpecs } from "@/lib/import/spec-extractor";
import { detectSubcategory, getSubcategoriesFor } from "@/lib/import/subcategories";
import { inferMainAndSub } from "@/lib/categories/tree";
import { cleanProductTitle, parseTitleParts } from "@/lib/import/title-cleaner";
import type { AIEnrichmentResult, EnrichmentContext } from "@/lib/import/types";
import { logError } from "@/lib/utils/logger";

const CATEGORY_OPTIONS = getAllDbValues();

interface EnrichmentInput {
  context: EnrichmentContext;
  suggestedRetailPrice: number;
  /** Supplier structured specs — source of truth; AI must not invent conflicting values. */
  supplierSpecs?: Record<string, string>;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3).trimEnd() + "...";
}

function normalizeTitle(title: string): string {
  return cleanProductTitle(title);
}

function inferCategory(title: string, description: string): string {
  return inferMainAndSub(`${title} ${description}`).main;
}

/**
 * Build realistic Norwegian search keywords (not random title words):
 * product type + device model combinations people actually search for.
 */
function buildFallbackTags(title: string, category: string, specs: Record<string, string>): string[] {
  const tags = new Set<string>();
  const parts = parseTitleParts(title);
  const baseLower = parts.base.toLowerCase();

  // Product-type keywords (multi-word phrases first – these are real queries)
  const typePhrases: Array<{ pattern: RegExp; phrases: string[] }> = [
    { pattern: /kameralinse|camera lens/i, phrases: ["kameralinsebeskytter", "kamerabeskyttelse"] },
    { pattern: /skjermbeskytter|screen protector/i, phrases: ["skjermbeskytter", "herdet glass"] },
    { pattern: /deksel|case|cover/i, phrases: ["mobildeksel", "deksel"] },
    { pattern: /lader|charger/i, phrases: ["lader", "hurtiglader"] },
    { pattern: /ladekabel|kabel|cable/i, phrases: ["ladekabel", "usb-c kabel"] },
    { pattern: /powerbank/i, phrases: ["powerbank", "nødlader"] },
    { pattern: /holder|mount|stativ/i, phrases: ["mobilholder", "holder"] },
    { pattern: /ørepropper|earbuds|hodetelefon|headset/i, phrases: ["trådløse ørepropper", "hodetelefoner"] },
    { pattern: /høyttaler|speaker/i, phrases: ["bluetooth høyttaler"] },
    { pattern: /tastatur|keyboard/i, phrases: ["tastatur"] },
    { pattern: /\bmus\b|mouse/i, phrases: ["gaming mus", "trådløs mus"] },
    { pattern: /hub\b/i, phrases: ["usb hub", "usb-c hub"] },
    { pattern: /led|rgb|lys/i, phrases: ["led lys", "rgb belysning"] },
  ];

  let mainPhrase: string | null = null;
  for (const { pattern, phrases } of typePhrases) {
    if (pattern.test(baseLower)) {
      phrases.forEach((phrase) => tags.add(phrase));
      mainPhrase = mainPhrase || phrases[0];
      break;
    }
  }

  // Combine product type with device model ("kameralinsebeskytter iphone 16")
  if (parts.compatibility) {
    const device = parts.compatibility.toLowerCase().replace(/\s+/g, " ").trim();
    tags.add(device);
    if (mainPhrase) {
      tags.add(truncate(`${mainPhrase} ${device}`, 60));
    }
  }

  // Meaningful words from the cleaned title
  parts.base
    .toLowerCase()
    .split(/[^a-zæøå0-9-]+/i)
    .filter((word) => word.length > 4)
    .slice(0, 3)
    .forEach((word) => tags.add(word));

  // Subcategory as a searchable phrase
  const subcategory = detectSubcategory(category, title);
  if (subcategory) {
    tags.add(subcategory.toLowerCase());
  }
  tags.add(category.toLowerCase());

  // Spec values that double as search terms (e.g. "herdet glass")
  const material = specs["Materiale"];
  if (material) {
    tags.add(material.toLowerCase());
  }

  return Array.from(tags)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length >= 3)
    .slice(0, 10);
}

function buildTypeAwareIntro(
  title: string,
  category: string,
  subcategory: string | null,
  specs: Record<string, string>
): { intro: string; benefits: string[] } {
  const t = title.toLowerCase();
  const material = specs["Materiale"] || specs["Material"] || "";
  const compat =
    specs["Kompatibilitet"] || specs["Compatibility"] || specs["Modell"] || "";

  if (/deksel|case|cover|etui/.test(t)) {
    return {
      intro: [
        "Beskytter telefonen mot riper og støt samtidig som den gir godt grep.",
        /magnet|magsafe|magnetic/.test(t)
          ? "Integrert magnetfeste gjør dekselet kompatibelt med magnetiske ladere og holdere."
          : "",
        material ? `Laget av ${material.toLowerCase()}.` : "",
        compat ? `Passer til ${compat}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      benefits: [
        "Beskyttelse mot riper og støt",
        "Godt grep i hverdagsbruk",
        "Enkel montering",
        material ? `Materiale: ${material}` : "Slitesterkt materiale",
        compat ? `Kompatibel med ${compat}` : "Presis passform",
      ],
    };
  }
  if (/skjermbeskytter|screen protector|herdet glass/.test(t)) {
    return {
      intro:
        "Beskytter skjermen mot riper og støt uten å redusere berøringsfølsomheten." +
        (compat ? ` Tilpasset ${compat}.` : ""),
      benefits: [
        "Klar sikt",
        "Riperesistent overflate",
        "Enkel installasjon",
        "Bevarer touch-respons",
        compat ? `Passer ${compat}` : "Presis tilpasning",
      ],
    };
  }
  if (/\bmus\b|mouse/.test(t)) {
    return {
      intro:
        "Høy presisjon og ergonomisk design gjør musen godt egnet til både gaming og produktivitet.",
      benefits: [
        "Presis sporing",
        "Ergonomisk form",
        "Passer gaming og kontor",
        "Responsiv sensoring",
        "Komfortabel i lengre økter",
      ],
    };
  }
  if (/ladekabel|charging cable|\bkabel\b/.test(t)) {
    return {
      intro:
        "Stabil data- og strømoverføring med slitesterk kabel." +
        (/usb-?c|type-?c/.test(t)
          ? " USB-C for moderne telefoner, nettbrett og laptoper."
          : ""),
      benefits: [
        "Stabil lading",
        "Slitesterk konstruksjon",
        "Fleksibel i bruk",
        "God trekkstyrke",
        material ? `Ytterkappe: ${material}` : "Daglig bruk",
      ],
    };
  }
  if (/hurtiglader|\blader\b|charger/.test(t) && !/kabel|cable/.test(t)) {
    return {
      intro:
        "Pålitelig lading med stabil strømforsyning til telefon, nettbrett og andre USB-enheter.",
      benefits: [
        "Stabil strømforsyning",
        "Kompakt design",
        "Passer flere enheter",
        "Egnet til hjem og reise",
        "Enkel i bruk",
      ],
    };
  }

  // Spec-driven fallback — never use filler slogans
  const specBits = Object.entries(specs)
    .filter(([k]) => !/\(zh\)|id|key|customs|supplier|status|listed/i.test(k))
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`);

  const label = subcategory || category;
  return {
    intro:
      specBits.length > 0
        ? `${specBits.join(". ")}.`
        : `Produkt i kategorien ${label}. Se spesifikasjoner og bilder for detaljer.`,
    benefits: specBits.length
      ? [
          ...specBits,
          "Se spesifikasjoner for tekniske detaljer",
          "Leveres som vist på bildene",
        ].slice(0, 5)
      : [
          `Kategori: ${category}`,
          "Se bilder for detaljer",
          "Se spesifikasjoner",
          "Standard emballasje",
          "Norsk nettbutikk",
        ],
  };
}

function buildFallbackEnrichment(input: EnrichmentInput): AIEnrichmentResult {
  const { context, supplierSpecs } = input;
  const category = inferCategory(context.originalTitle, context.originalDescription);
  const title = normalizeTitle(context.originalTitle);
  const subcategory = detectSubcategory(
    category,
    `${context.originalTitle} ${context.originalDescription}`
  );
  // Prefer supplier specs; only fill gaps from text extraction
  const extracted = extractSpecs(
    context.originalTitle,
    context.originalDescription,
    context.specs
  );
  const specifications: Record<string, string> = {
    ...extracted,
    ...(supplierSpecs || context.specs || {}),
  };
  if (Object.keys(specifications).length === 0) {
    specifications["Kategori"] = category;
  }
  const { intro: shortIntroduction, benefits } = buildTypeAwareIntro(
    title,
    category,
    subcategory,
    specifications
  );
  const detectedContents = detectPackageContents(
    context.originalTitle,
    context.originalDescription
  );
  const packageContents =
    detectedContents.length > 0
      ? detectedContents.join("\n")
      : "1 x produkt (som vist på bildene).";
  const tags = buildFallbackTags(context.originalTitle, category, specifications);
  const slug = generateProductSlug(title);
  const metaTitle = truncate(`${title} | ElectroHypeX`, 60);
  const metaDescription = truncate(
    `${title} – ${shortIntroduction} Levering 5–12 virkedager.`,
    155
  );

  return {
    title,
    shortIntroduction,
    benefits,
    specifications,
    packageContents,
    category,
    subcategory,
    tags,
    slug,
    metaTitle,
    metaDescription,
  };
}

function parseAIResponse(content: string): Partial<AIEnrichmentResult> {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI-respons mangler JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    title: typeof parsed.title === "string" ? parsed.title : undefined,
    shortIntroduction:
      typeof parsed.shortIntroduction === "string" ? parsed.shortIntroduction : undefined,
    benefits: Array.isArray(parsed.benefits)
      ? parsed.benefits.filter((item: unknown) => typeof item === "string")
      : undefined,
    specifications:
      parsed.specifications && typeof parsed.specifications === "object"
        ? Object.fromEntries(
            Object.entries(parsed.specifications)
              .filter(([, value]) => typeof value === "string")
              .map(([key, value]) => [key, value as string])
          )
        : undefined,
    packageContents:
      typeof parsed.packageContents === "string" ? parsed.packageContents : undefined,
    category: typeof parsed.category === "string" ? parsed.category : undefined,
    subcategory: typeof parsed.subcategory === "string" ? parsed.subcategory : undefined,
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((item: unknown) => typeof item === "string")
      : undefined,
    slug: typeof parsed.slug === "string" ? parsed.slug : undefined,
    metaTitle: typeof parsed.metaTitle === "string" ? parsed.metaTitle : undefined,
    metaDescription:
      typeof parsed.metaDescription === "string" ? parsed.metaDescription : undefined,
  };
}

function sanitizeEnrichment(
  partial: Partial<AIEnrichmentResult>,
  fallback: AIEnrichmentResult
): AIEnrichmentResult {
  const title = normalizeTitle(partial.title || fallback.title);
  const category = CATEGORY_OPTIONS.includes(partial.category || "")
    ? (partial.category as string)
    : fallback.category;
  const validSubcategories = getSubcategoriesFor(category);
  const subcategory =
    partial.subcategory && validSubcategories.includes(partial.subcategory)
      ? partial.subcategory
      : (fallback.subcategory ?? null);
  const benefits = (partial.benefits || fallback.benefits).slice(0, 5);
  while (benefits.length < 5) {
    benefits.push(fallback.benefits[benefits.length] || "Se spesifikasjoner for detaljer");
  }

  const specifications = {
    ...(partial.specifications || {}),
    ...fallback.specifications,
  };

  const tags = Array.from(
    new Set((partial.tags || fallback.tags).map((tag) => tag.trim().toLowerCase()))
  )
    .filter(Boolean)
    .slice(0, 10);

  while (tags.length < 5) {
    tags.push(...fallback.tags.filter((tag) => !tags.includes(tag)));
  }

  const slug = generateProductSlug(partial.slug || title || fallback.slug);
  const metaTitle = truncate(partial.metaTitle || `${title} | ElectroHypeX`, 60);
  const metaDescription = truncate(
    partial.metaDescription ||
      `${title} – ${partial.shortIntroduction || fallback.shortIntroduction}`,
    155
  );

  return {
    title,
    shortIntroduction: partial.shortIntroduction || fallback.shortIntroduction,
    benefits,
    specifications,
    packageContents: partial.packageContents || fallback.packageContents,
    category,
    subcategory,
    tags: tags.slice(0, 10),
    slug,
    metaTitle,
    metaDescription,
  };
}

async function callOpenAI(input: EnrichmentInput): Promise<AIEnrichmentResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const { context, suggestedRetailPrice, supplierSpecs } = input;
  const truthSpecs = { ...(context.specs || {}), ...(supplierSpecs || {}) };
  const specsText = Object.entries(truthSpecs)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  const subcategoryHints = CATEGORY_OPTIONS.map((cat) => {
    const subs = getSubcategoriesFor(cat);
    return subs.length > 0 ? `${cat}: ${subs.join(", ")}` : null;
  })
    .filter(Boolean)
    .join("\n");

  const prompt = `Du er en norsk e-handelsekspert. Lag profesjonelt butikkinnhold basert på leverandørdata.

KRITISKE REGLER FOR SPESIFIKASJONER:
- Leverandørspesifikasjonene under er SANNHETEN. Bruk dem.
- Du skal ALDRI finne opp materiale, vekt, mål, spenning, batteri, EAN eller andre fakta.
- Du kan oversette nøkler til norsk, men verdiene må forbli korrekte.
- Hvis noe mangler i leverandørdata: utelat det — ikke gjett.

TITTEL-REGLER:
- Skriv om tittelen til naturlig, korrekt norsk. Maks 60 tegn, helst 45-60.
- Fjern keyword-stuffing, dupliserte ord og "Egnet for".
- Fjern unødvendige markedsføringsfraser ("høykvalitets", "hot sale" osv.).
- Ta med modellnavn der det er relevant.
- Behold viktig produktinfo (materiale, antall).

INNHOLD:
- Ikke kopier leverandørbeskrivelsen ordrett. Skriv alt på nytt på naturlig norsk.
- shortIntroduction MÅ være spesifikk for produkttype (f.eks. telefondeksel ≠ gaming-utstyr).
- ALDRI generiske fraser: "praktisk produkt", "tilpasset daglig bruk", "god verdi for pengene".
- Bruk materiale, funksjoner og kompatibilitet fra spesifikasjonene.
- Hvis data mangler: skriv korte, konkrete setninger basert på tittel/kategori — ikke fyllstoff.
- Ingen emojis, ingen ALL CAPS, ingen clickbait.
- packageContents: List alt som følger med i pakken når det fremgår av dataene.
- specifications: kun kundevennlige felt på norsk. Utelat Customs Name, Packaging Key, Category ID, Status, Supplier ID, Material (ZH) og annen leverandørmetadata.

SEO:
- Meta-tittel maks 60 tegn, meta-beskrivelse maks 155 tegn – profesjonell og salgbar.
- tags: 5-10 realistiske norske søkeord.
- Slug skal være ren, norsk-vennlig og URL-sikker (kun a-z, 0-9 og bindestrek).

KATEGORI:
- Velg nøyaktig én hovedkategori fra listen: ${CATEGORY_OPTIONS.join(", ")}
- Velg også en underkategori fra listen under (eller null hvis ingen passer):
${subcategoryHints}

Original tittel: ${context.originalTitle}
Original beskrivelse (kun kontekst, ikke kopier): ${context.originalDescription || "Ingen"}
Leverandørpris (NOK): ${Math.round(context.costNOK)}
Foreslått salgspris (NOK): ${suggestedRetailPrice}
Leverandørspesifikasjoner (SANNHET — ikke erstatt):
${specsText || "Ingen"}

Returner KUN gyldig JSON:
{
  "title": "norsk produktnavn",
  "shortIntroduction": "kort innledning på 1-2 setninger",
  "benefits": ["fordel 1", "fordel 2", "fordel 3", "fordel 4", "fordel 5"],
  "specifications": { "Nøkkel": "verdi" },
  "packageContents": "del 1\\ndel 2",
  "category": "én av hovedkategoriene",
  "subcategory": "underkategori eller null",
  "tags": ["søkeord 1", "søkeord 2"],
  "slug": "url-slug",
  "metaTitle": "seo tittel",
  "metaDescription": "seo beskrivelse"
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Du skriver profesjonelt butikkinnhold på norsk for en elektronikk- og tilbehørsbutikk.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `OpenAI API feil (${response.status})`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Tom respons fra OpenAI");
  }

  const fallback = buildFallbackEnrichment(input);
  const partial = parseAIResponse(content);
  return sanitizeEnrichment(partial, fallback);
}

export async function enrichProductWithAI(
  input: EnrichmentInput
): Promise<{ enrichment: AIEnrichmentResult; aiGenerated: boolean; warning?: string }> {
  const fallback = buildFallbackEnrichment(input);

  try {
    const enrichment = await callOpenAI(input);
    return { enrichment, aiGenerated: true };
  } catch (error) {
    logError(error, "[import/ai-enrichment]");
    return {
      enrichment: fallback,
      aiGenerated: false,
      warning:
        error instanceof Error
          ? `AI-generering feilet: ${error.message}. Regelbasert fallback brukes.`
          : "AI-generering feilet. Regelbasert fallback brukes.",
    };
  }
}

export function enrichmentToDescription(
  enrichment: AIEnrichmentResult,
  deliveryTime?: string
): string {
  return formatProductDescription(enrichment, { deliveryTime });
}

export function enrichmentToShortDescription(enrichment: AIEnrichmentResult): string {
  return truncate(enrichment.shortIntroduction, 150);
}
