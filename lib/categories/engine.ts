/**
 * ElectroHypeX Category Engine — single assignment API for all imports + rebuild.
 * Supplier category is a hint only. Exactly one allowlist main + optional subcategory + tags.
 */

import "server-only";

import { getAllDbValues } from "@/lib/categories";
import {
  assertMainCategory,
  detectSubcategory,
  inferMainAndSub,
  listSubsFor,
  normalizeLegacyCategory,
  normalizeSubcategory,
} from "@/lib/categories/tree";
import {
  formatLearningForPrompt,
  getCategoryLearning,
  type CategoryLearningStore,
} from "@/lib/ops/category-learning";
import { logError } from "@/lib/utils/logger";
import {
  AI_CATEGORY_AUTO_MIN,
} from "@/lib/admin/ai-categorize-constants";

export type AiCategoryStatus =
  | "pending"
  | "needs_review"
  | "applied"
  | "corrected"
  | "dismissed";

export type CategoryAssignment = {
  main: string;
  subcategory: string | null;
  tags: string[];
  confidence: number;
  reason: string;
  /** applied when confidence >= AUTO_MIN; needs_review otherwise (still provisional main). */
  status: "applied" | "needs_review";
  source: "ai" | "heuristic" | "learning";
};

export type AssignCategoryInput = {
  title: string;
  description?: string | null;
  shortDescription?: string | null;
  specs?: Record<string, string> | null;
  variants?: string[] | null;
  images?: string[] | null;
  /** Weak hint only — never trusted as final. */
  supplierCategory?: string | null;
  tags?: string[] | null;
  learning?: CategoryLearningStore | null;
};

function clampConfidence(n: unknown): number {
  const v = typeof n === "number" ? n : Number.parseFloat(String(n ?? ""));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => String(t ?? "").trim())
    .filter((t) => t.length >= 2 && t.length <= 48)
    .slice(0, 10);
}

function buildAttributeTags(
  text: string,
  subcategory: string | null,
  existing: string[]
): string[] {
  const tags = new Set<string>(existing.map((t) => t.toLowerCase()));
  const lower = text.toLowerCase();
  const attrs: Array<[RegExp, string]> = [
    [/\brgb\b/i, "RGB"],
    [/trådløs|wireless/i, "Trådløs"],
    [/usb[- ]?c/i, "USB-C"],
    [/esport|esports/i, "Esport"],
    [/iphone\s*\d+/i, "iPhone"],
    [/samsung|galaxy/i, "Samsung"],
    [/magsafe/i, "MagSafe"],
    [/bluetooth/i, "Bluetooth"],
    [/mekanisk|mechanical/i, "Mekanisk"],
  ];
  for (const [re, label] of attrs) {
    if (re.test(lower)) tags.add(label);
  }
  if (subcategory) tags.add(subcategory);
  return Array.from(tags).slice(0, 10);
}

function matchLearning(
  title: string,
  store: CategoryLearningStore
): { main: string; confidence: number; reason: string } | null {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-zæøå0-9\s\-]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  let best: { main: string; score: number; name: string } | null = null;
  for (const c of store.corrections.slice(0, 80)) {
    const main = assertMainCategory(c.toCategory);
    if (!main) continue;
    const kw = c.keywords.length ? c.keywords : [];
    let score = 0;
    for (const k of kw) {
      if (tokens.includes(k.toLowerCase())) score += 1;
    }
    // Also soft-match product name overlap
    const nameTokens = c.productName
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    for (const t of nameTokens) {
      if (tokens.includes(t)) score += 0.5;
    }
    if (score >= 2 && (!best || score > best.score)) {
      best = { main, score, name: c.productName };
    }
  }
  if (!best) return null;
  return {
    main: best.main,
    confidence: Math.min(96, 78 + best.score * 4),
    reason: `Lært fra tidligere korreksjon (liknende: «${best.name.slice(0, 60)}»)`,
  };
}

function sanitizeAssignment(
  partial: {
    main?: string | null;
    subcategory?: string | null;
    tags?: string[];
    confidence?: number;
    reason?: string;
    source?: CategoryAssignment["source"];
  },
  text: string,
  supplierCategory?: string | null
): CategoryAssignment {
  let main =
    assertMainCategory(partial.main || undefined) ||
    normalizeLegacyCategory(partial.main || undefined) ||
    normalizeLegacyCategory(supplierCategory || undefined);

  let subcategory = main
    ? normalizeSubcategory(main, partial.subcategory) ||
      detectSubcategory(main, text)
    : null;

  let confidence = clampConfidence(partial.confidence ?? 0);
  let reason = (partial.reason || "Automatisk kategorisering").slice(0, 280);
  let source = partial.source || "heuristic";

  if (!main) {
    const inferred = inferMainAndSub(text);
    main = inferred.main;
    subcategory = inferred.subcategory;
    confidence = Math.min(confidence || inferred.confidence, inferred.confidence);
    reason = reason || "Heuristisk fallback";
    source = "heuristic";
  }

  if (!subcategory && main) {
    subcategory = detectSubcategory(main, text);
  }

  const tags = buildAttributeTags(
    text,
    subcategory,
    sanitizeTags(partial.tags)
  );

  if (confidence < 1) {
    confidence = inferMainAndSub(text).confidence;
  }

  const status: CategoryAssignment["status"] =
    confidence >= AI_CATEGORY_AUTO_MIN ? "applied" : "needs_review";

  return {
    main,
    subcategory,
    tags,
    confidence,
    reason,
    status,
    source,
  };
}

async function callOpenAIAssign(
  input: AssignCategoryInput,
  learningBlock: string
): Promise<CategoryAssignment | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const categories = getAllDbValues();
  const subcategoryHint = categories
    .map((c) => `${c}: ${listSubsFor(c).join(", ") || "(ingen)"}`)
    .join("\n");

  const textBundle = [
    input.title,
    input.shortDescription || "",
    (input.description || "").slice(0, 800),
    (input.variants || []).join(", "),
    Object.entries(input.specs || {})
      .slice(0, 20)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; "),
  ]
    .join(" ")
    .slice(0, 4000);

  const prompt = `Du er kategoriseringsekspert for norsk elektronikk-nettbutikk ElectroHypeX (Category Intelligence V2).

OPPGAVE: Velg ÉN hovedkategori og én underkategori. Leverandørkategori er KUN et svakt hint.

TILLATTE HOVEDKATEGORIER (kun disse):
${categories.map((c) => `- ${c}`).join("\n")}

UNDERKATEGORIER:
${subcategoryHint}

LÆRING FRA ADMINISTRATOR:
${learningBlock}

KRITISKE REGLER — FUNKSJON FØRST (ikke markedsføring):
- Ord som Gaming, RGB, Pro, Ultra, Max er markedsføring og skal IKKE styre kategori alene.
- phone case / case / cover / iphone / samsung / pixel / galaxy / magsafe / screen protector / charger / cable / powerbank / usb-c / lightning → ALLTID Mobil & Tilbehør (også "Gaming Phone Case", "Gaming RGB Phone Charger").
- earbuds / headphones / speaker / soundbar → TV, Lyd & Bilde (også "Wireless Gaming Earbuds").
- Gaming Mouse / RGB Mouse Pad / gaming tastatur / gaming headset (ekte periferi) → Gaming.
- LED-lampe / rose lamp / dekorlys → Hjem & Fritid.
- Ett produkt = én hovedkategori. Aldri flere.
- Analyser tittel, beskrivelse, specs, varianter og bilde-URL-er.
- Confidence 0–100. Vær ærlig: under 90 = usikker.
- Tags: 3–8 attributt-tagger (RGB, Trådløs, USB-C, enhetsfamilie…) — tagger er IKKE kategorier.

PRODUKT:
${JSON.stringify({
  title: input.title,
  shortDescription: (input.shortDescription || "").slice(0, 280),
  description: (input.description || "").replace(/<[^>]+>/g, " ").slice(0, 600),
  supplierCategoryHint: input.supplierCategory || null,
  variants: (input.variants || []).slice(0, 12),
  imageUrls: (input.images || []).slice(0, 4),
  specs: Object.fromEntries(Object.entries(input.specs || {}).slice(0, 16)),
  existingTags: (input.tags || []).slice(0, 12),
})}

Returner KUN JSON:
{
  "category": "en av tillatte",
  "subcategory": "gyldig underkategori eller null",
  "tags": ["tag1", "tag2"],
  "confidence": 0-100,
  "reason": "kort begrunnelse på norsk"
}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);

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
              "Du kategoriserer produkter for norsk e-handel. Returner kun gyldig JSON. Aldri opprett nye hovedkategorier.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.15,
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { error?: { message?: string } }).error?.message ||
          `OpenAI feil (${response.status})`
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Tom AI-respons");

    const parsed = JSON.parse(content) as Record<string, unknown>;
    return sanitizeAssignment(
      {
        main: String(parsed.category || ""),
        subcategory: parsed.subcategory ? String(parsed.subcategory) : null,
        tags: sanitizeTags(parsed.tags),
        confidence: clampConfidence(parsed.confidence),
        reason: String(parsed.reason || "AI-kategorisering"),
        source: "ai",
      },
      textBundle,
      input.supplierCategory
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Assign exactly one store main category (+ subcategory + tags).
 * Always returns a valid allowlist main (provisional if low confidence).
 */
export async function assignCategory(
  input: AssignCategoryInput
): Promise<CategoryAssignment> {
  const text = [
    input.title,
    input.shortDescription || "",
    input.description || "",
    (input.variants || []).join(" "),
  ]
    .join(" ")
    .slice(0, 4000);

  const learning = input.learning ?? (await getCategoryLearning());
  const learned = matchLearning(input.title, learning);
  if (learned && learned.confidence >= AI_CATEGORY_AUTO_MIN) {
    return sanitizeAssignment(
      {
        main: learned.main,
        subcategory: detectSubcategory(learned.main, text),
        tags: input.tags || [],
        confidence: learned.confidence,
        reason: learned.reason,
        source: "learning",
      },
      text,
      input.supplierCategory
    );
  }

  const learningBlock = formatLearningForPrompt(learning);

  try {
    const ai = await callOpenAIAssign(input, learningBlock);
    if (ai) {
      // Boost slightly if learning agrees
      if (learned && learned.main === ai.main) {
        return {
          ...ai,
          confidence: Math.min(99, ai.confidence + 4),
          reason: `${ai.reason} (bekreftet av læring)`,
        };
      }
      return ai;
    }
  } catch (error) {
    logError(error, "[category-engine]");
  }

  if (learned) {
    return sanitizeAssignment(
      {
        main: learned.main,
        subcategory: detectSubcategory(learned.main, text),
        tags: input.tags || [],
        confidence: learned.confidence,
        reason: learned.reason,
        source: "learning",
      },
      text,
      input.supplierCategory
    );
  }

  const inferred = inferMainAndSub(text);
  return sanitizeAssignment(
    {
      main: inferred.main,
      subcategory: inferred.subcategory,
      tags: input.tags || [],
      confidence: inferred.confidence,
      reason: "Heuristisk kategorisering (AI utilgjengelig)",
      source: "heuristic",
    },
    text,
    input.supplierCategory
  );
}

/** Prisma-ready fields from an assignment. */
export function assignmentToProductFields(assignment: CategoryAssignment): {
  category: string;
  subcategory: string | null;
  tags: string;
  aiCategorySuggested: string;
  aiCategoryConfidence: number;
  aiCategoryReason: string;
  aiCategoryStatus: AiCategoryStatus;
  aiCategoryAt: Date;
} {
  return {
    category: assignment.main,
    subcategory: assignment.subcategory,
    tags: JSON.stringify(assignment.tags),
    aiCategorySuggested: assignment.main,
    aiCategoryConfidence: assignment.confidence,
    aiCategoryReason: assignment.reason,
    aiCategoryStatus: assignment.status,
    aiCategoryAt: new Date(),
  };
}

/** Merge Underkategori into specs for backwards-compatible UIs. */
export function mergeSubcategoryIntoSpecs(
  existing: unknown,
  subcategory: string | null
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (subcategory) {
    base["Underkategori"] = subcategory;
  }
  return base;
}
