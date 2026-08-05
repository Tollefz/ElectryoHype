/**
 * Optional vision analysis for product images.
 * Falls back gracefully when OPENAI_API_KEY is missing.
 */

import "server-only";

import { logError } from "@/lib/utils/logger";
import { shopProfilePromptBlock } from "@/lib/suppliers/merchandiser/shop-profile";
import type {
  MerchandiserVisualAdvice,
  ShopProfileData,
} from "@/lib/suppliers/merchandiser/types";

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Heuristic visual score from image URLs / title (no API). */
export function heuristicVisualAdvice(input: {
  images: string[];
  title?: string | null;
  description?: string | null;
}): MerchandiserVisualAdvice {
  const n = input.images?.length || 0;
  const chinese =
    /[\u4e00-\u9fff]/.test(input.title || "") ||
    /[\u4e00-\u9fff]/.test(input.description || "");
  return {
    premiumFeel: clamp(n === 0 ? 15 : 35 + n * 8),
    whiteBackgroundLikely: n >= 3,
    resolutionHint: n >= 5 ? "high" : n >= 2 ? "medium" : n === 1 ? "low" : "unknown",
    watermarkRisk: false,
    chineseTextRisk: chinese,
    lifestyleImages: n >= 6,
    packagingVisible: n >= 4,
    summary:
      n === 0
        ? "Ingen bilder."
        : `${n} bilder vurdert heuristisk${chinese ? "; kinesisk tekst i metadata" : ""}.`,
    aiAnalyzed: false,
  };
}

/**
 * Vision model analysis of up to 4 images.
 * Returns null if API unavailable — caller keeps heuristic.
 */
export async function analyzeProductImagesWithAI(input: {
  images: string[];
  title: string;
  profile: ShopProfileData;
}): Promise<MerchandiserVisualAdvice | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const urls = (input.images || []).filter((u) => /^https?:\/\//i.test(u)).slice(0, 4);
  if (urls.length === 0) return null;

  try {
    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Du er visuell merchandiser for en norsk elektronikkbutikk.

${shopProfilePromptBlock(input.profile)}

Produkt: ${input.title}

Analyser bildene. Svar KUN med JSON:
{
  "premiumFeel": 0-100,
  "whiteBackgroundLikely": boolean,
  "resolutionHint": "low"|"medium"|"high"|"unknown",
  "watermarkRisk": boolean,
  "chineseTextRisk": boolean,
  "lifestyleImages": boolean,
  "packagingVisible": boolean,
  "summary": "1-2 setninger på norsk"
}`,
      },
      ...urls.map((url) => ({
        type: "image_url",
        image_url: { url, detail: "low" },
      })),
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Vision API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as Partial<MerchandiserVisualAdvice>;

    return {
      premiumFeel: clamp(Number(parsed.premiumFeel) || 50),
      whiteBackgroundLikely: Boolean(parsed.whiteBackgroundLikely),
      resolutionHint:
        parsed.resolutionHint === "low" ||
        parsed.resolutionHint === "medium" ||
        parsed.resolutionHint === "high"
          ? parsed.resolutionHint
          : "unknown",
      watermarkRisk: Boolean(parsed.watermarkRisk),
      chineseTextRisk: Boolean(parsed.chineseTextRisk),
      lifestyleImages: Boolean(parsed.lifestyleImages),
      packagingVisible: Boolean(parsed.packagingVisible),
      summary: String(parsed.summary || "AI-visuell analyse fullført."),
      aiAnalyzed: true,
    };
  } catch (error) {
    logError(error, "[merchandiser/visual]");
    return null;
  }
}
