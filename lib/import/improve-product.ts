import "server-only";

import { getAllDbValues } from "@/lib/categories";
import { formatProductDescription } from "@/lib/import/format-description";
import {
  calculateCompareAtPrice,
  calculateSuggestedRetailPrice,
  getMarginMultiplier,
} from "@/lib/import/pricing";
import { generateProductSlug } from "@/lib/import/product-slug";
import { cleanProductTitle } from "@/lib/import/title-cleaner";
import type { AIImproveResult, ImportEditableField } from "@/lib/import/types";
import { logError } from "@/lib/utils/logger";

const CATEGORY_OPTIONS = getAllDbValues();

export interface ImproveProductInput {
  originalName: string;
  originalDescription: string;
  originalPrice: number;
  name: string;
  description: string;
  shortDescription: string;
  category: string;
  tags: string[];
  slug: string;
  metaTitle: string;
  metaDescription: string;
  suggestedPrice: number;
  compareAtPrice: number;
  specs: Record<string, string>;
  highlightedFeatures?: string[];
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3).trimEnd() + "...";
}

function normalizeTitle(title: string): string {
  return cleanProductTitle(title);
}

function buildFallbackImprove(input: ImproveProductInput): AIImproveResult {
  const suggestedPrice = calculateSuggestedRetailPrice(input.originalPrice);
  const title = normalizeTitle(input.name || input.originalName);
  const shortIntroduction =
    input.shortDescription ||
    `Et kvalitetsprodukt i kategorien ${input.category}, tilpasset daglig bruk.`;
  const benefits = [
    "Enkel å bruke i hverdagen",
    "God verdi for pengene",
    "Passer til flere bruksområder",
    "Kompakt og praktisk design",
    "Rask levering fra norsk nettbutikk",
  ];
  const highlightedFeatures =
    input.highlightedFeatures && input.highlightedFeatures.length > 0
      ? input.highlightedFeatures
      : benefits.slice(0, 4);
  const specifications =
    Object.keys(input.specs).length > 0
      ? input.specs
      : { Kategori: input.category };

  const description = formatProductDescription({
    shortIntroduction,
    benefits,
    specifications,
    packageContents: "1 x produkt (som vist på bildene).",
    highlightedFeatures,
  });

  return {
    name: title,
    description,
    shortDescription: truncate(shortIntroduction, 150),
    category: input.category,
    tags: input.tags.length >= 5 ? input.tags : [...input.tags, "elektronikk", "tilbehør"],
    slug: generateProductSlug(title),
    metaTitle: truncate(`${title} | ElectroHypeX`, 60),
    metaDescription: truncate(`${title} – ${shortIntroduction} Levering 5–12 virkedager.`, 155),
    suggestedPrice,
    compareAtPrice: calculateCompareAtPrice(suggestedPrice),
    highlightedFeatures,
  };
}

function parseImproveResponse(content: string): Partial<AIImproveResult> & {
  shortIntroduction?: string;
  benefits?: string[];
  specifications?: Record<string, string>;
  packageContents?: string;
} {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI-respons mangler JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    name: typeof parsed.title === "string" ? parsed.title : undefined,
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
    highlightedFeatures: Array.isArray(parsed.highlightedFeatures)
      ? parsed.highlightedFeatures.filter((item: unknown) => typeof item === "string")
      : undefined,
    category: typeof parsed.category === "string" ? parsed.category : undefined,
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((item: unknown) => typeof item === "string")
      : undefined,
    slug: typeof parsed.slug === "string" ? parsed.slug : undefined,
    metaTitle: typeof parsed.metaTitle === "string" ? parsed.metaTitle : undefined,
    metaDescription:
      typeof parsed.metaDescription === "string" ? parsed.metaDescription : undefined,
    suggestedPrice:
      typeof parsed.suggestedPrice === "number" ? Math.round(parsed.suggestedPrice) : undefined,
    compareAtPrice:
      typeof parsed.compareAtPrice === "number" ? Math.round(parsed.compareAtPrice) : undefined,
  };
}

function sanitizeImprove(
  partial: ReturnType<typeof parseImproveResponse>,
  fallback: AIImproveResult,
  input: ImproveProductInput
): AIImproveResult {
  const name = normalizeTitle(partial.name || fallback.name);
  const category = CATEGORY_OPTIONS.includes(partial.category || "")
    ? (partial.category as string)
    : fallback.category;
  const benefits = (partial.benefits || []).slice(0, 5);
  while (benefits.length < 5) {
    benefits.push("Praktisk i hverdagen");
  }

  const highlightedFeatures = (partial.highlightedFeatures || fallback.highlightedFeatures).slice(
    0,
    6
  );
  const specifications = {
    ...(Object.keys(input.specs).length > 0 ? input.specs : {}),
    ...(partial.specifications || {}),
  };

  const description = formatProductDescription({
    shortIntroduction: partial.shortIntroduction || input.shortDescription || fallback.shortDescription,
    benefits,
    specifications,
    packageContents: partial.packageContents || "1 x produkt (som vist på bildene).",
    highlightedFeatures,
  });

  const shortDescription = truncate(
    partial.shortIntroduction || fallback.shortDescription,
    150
  );

  const tags = Array.from(
    new Set((partial.tags || fallback.tags).map((tag) => tag.trim().toLowerCase()))
  )
    .filter(Boolean)
    .slice(0, 10);

  const suggestedPrice = partial.suggestedPrice || fallback.suggestedPrice;
  const compareAtPrice =
    partial.compareAtPrice || calculateCompareAtPrice(suggestedPrice);

  return {
    name,
    description,
    shortDescription,
    category,
    tags: tags.length >= 5 ? tags : fallback.tags,
    slug: generateProductSlug(partial.slug || name),
    metaTitle: truncate(partial.metaTitle || `${name} | ElectroHypeX`, 60),
    metaDescription: truncate(
      partial.metaDescription || `${name} – ${shortDescription}`,
      155
    ),
    suggestedPrice,
    compareAtPrice,
    highlightedFeatures,
  };
}

async function callOpenAIImprove(input: ImproveProductInput): Promise<AIImproveResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const costNOK = input.originalPrice;
  const multiplier = getMarginMultiplier(costNOK);
  const algorithmicPrice = calculateSuggestedRetailPrice(costNOK);
  const specsText = Object.entries(input.specs)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  const prompt = `Forbedre dette produktet for en norsk nettbutikk. Skriv på nytt – ikke kopier originaltekst.

TITTEL-REGLER:
- Naturlig, korrekt norsk. Maks 60 tegn, helst 45-60.
- Fjern keyword-stuffing, dupliserte ord og "Egnet for".
- Ta med modellnavn der det er relevant (f.eks. iPhone 16/17).
- Eksempel: "3 Stk Full Dekkende Herdet Glass Kameralinsebeskytter Egnet For iPhone"
  skal bli: "Kameralinsebeskytter i Herdet Glass – iPhone 16/17 (3-pk)"

REGLER:
- Naturlig norsk, ingen emojis, ingen ALL CAPS, ingen clickbait
- Meta-tittel maks 60 tegn, meta-beskrivelse maks 155 tegn
- 5-10 realistiske norske søkeord folk faktisk søker etter (tags, små bokstaver,
  fraser som "kameralinsebeskytter iphone 16" – ikke tilfeldige ord)
- 3-6 viktige produktegenskaper (highlightedFeatures)
- 5 fordeler (benefits)
- Behold ALLE spesifikasjoner – ikke mist noen
- packageContents: alt som følger med, én linje per del
- Pris: leverandør ${costNOK} NOK, dynamisk priskurve gir ${multiplier.toFixed(2)}x, forslag ca. ${algorithmicPrice} NOK (avrund til nærmeste 9-tall: 249, 499, 999 osv.)

Kategorier: ${CATEGORY_OPTIONS.join(", ")}

Original tittel: ${input.originalName}
Original beskrivelse: ${input.originalDescription || "Ingen"}
Nåværende navn: ${input.name}
Nåværende kategori: ${input.category}
Nåværende pris: ${input.suggestedPrice} kr
Spesifikasjoner:
${specsText || "Ingen"}

Returner KUN JSON:
{
  "title": "forbedret produktnavn",
  "shortIntroduction": "1-2 setninger",
  "highlightedFeatures": ["viktig egenskap 1", "viktig egenskap 2"],
  "benefits": ["fordel 1", "fordel 2", "fordel 3", "fordel 4", "fordel 5"],
  "specifications": { "Nøkkel": "verdi" },
  "packageContents": "pakkens innhold",
  "category": "kategori fra listen",
  "tags": ["tag1", "tag2"],
  "slug": "produkt-slug",
  "metaTitle": "seo tittel",
  "metaDescription": "seo beskrivelse",
  "suggestedPrice": ${algorithmicPrice},
  "compareAtPrice": ${calculateCompareAtPrice(algorithmicPrice)}
}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
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
              "Du forbedrer produktinnhold for norsk e-handel. Vær presis og rask. Returner kun JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 1100,
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

    const fallback = buildFallbackImprove(input);
    const partial = parseImproveResponse(content);
    return sanitizeImprove(partial, fallback, input);
  } finally {
    clearTimeout(timeout);
  }
}

function pickUpdates(
  improved: AIImproveResult,
  preserveFields: ImportEditableField[]
): Partial<AIImproveResult> {
  const preserve = new Set(preserveFields);
  const updates: Partial<AIImproveResult> = {};

  if (!preserve.has("name")) updates.name = improved.name;
  if (!preserve.has("description")) updates.description = improved.description;
  if (!preserve.has("shortDescription")) updates.shortDescription = improved.shortDescription;
  if (!preserve.has("category")) updates.category = improved.category;
  if (!preserve.has("tags")) updates.tags = improved.tags;
  if (!preserve.has("slug")) updates.slug = improved.slug;
  if (!preserve.has("metaTitle")) updates.metaTitle = improved.metaTitle;
  if (!preserve.has("metaDescription")) updates.metaDescription = improved.metaDescription;
  if (!preserve.has("suggestedPrice")) updates.suggestedPrice = improved.suggestedPrice;
  if (!preserve.has("compareAtPrice")) updates.compareAtPrice = improved.compareAtPrice;
  if (!preserve.has("description")) {
    updates.highlightedFeatures = improved.highlightedFeatures;
  }

  return updates;
}

export async function improveProductWithAI(
  input: ImproveProductInput,
  preserveFields: ImportEditableField[] = []
): Promise<{
  updates: Partial<AIImproveResult>;
  preservedFields: ImportEditableField[];
  aiGenerated: boolean;
  warning?: string;
}> {
  try {
    const improved = await callOpenAIImprove(input);
    return {
      updates: pickUpdates(improved, preserveFields),
      preservedFields: preserveFields,
      aiGenerated: true,
    };
  } catch (error) {
    logError(error, "[import/improve-product]");
    const fallback = buildFallbackImprove(input);
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "AI-forbedring tok for lang tid (>9s). Regelbasert fallback brukes."
        : error instanceof Error
          ? `AI-forbedring feilet: ${error.message}. Regelbasert fallback brukes.`
          : "AI-forbedring feilet. Regelbasert fallback brukes.";

    return {
      updates: pickUpdates(fallback, preserveFields),
      preservedFields: preserveFields,
      aiGenerated: false,
      warning: message,
    };
  }
}
