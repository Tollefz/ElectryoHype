/**
 * Optional AI market / narrative refinement on top of heuristic analysis.
 */

import "server-only";

import { logError } from "@/lib/utils/logger";
import { shopProfilePromptBlock } from "@/lib/suppliers/merchandiser/shop-profile";
import type {
  MerchandiserAnalysis,
  ShopProfileData,
} from "@/lib/suppliers/merchandiser/types";

/**
 * Refine reasons/explanation/market summary with LLM when available.
 * Never invents supplier facts — only merchandising judgment.
 */
export async function refineAnalysisWithAI(input: {
  title: string;
  category: string | null;
  analysis: MerchandiserAnalysis;
  profile: ShopProfileData;
}): Promise<MerchandiserAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return input.analysis;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MERCHANDISER_MODEL || "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Du er AI Merchandiser / digital innkjøper for ElectroHypeX. Du anbefaler — du publiserer aldri. Svar kun JSON.",
          },
          {
            role: "user",
            content: `${shopProfilePromptBlock(input.profile)}

Produkt: ${input.title}
Kategori: ${input.category || "—"}
Heuristisk score: ${input.analysis.scores.overall}
Dimensjoner: ${JSON.stringify(input.analysis.scores)}
Risiko: ${JSON.stringify(input.analysis.risks)}
Prisråd: ${JSON.stringify(input.analysis.pricing)}

Returner JSON:
{
  "reasons": ["kort punkt", "..."],
  "explanation": "2-3 setninger på norsk som forklarer anbefalingen",
  "buyerPersona": "kort",
  "fitsStore": true/false,
  "summary": "én setning market fit"
}`,
          },
        ],
      }),
    });

    if (!res.ok) return input.analysis;
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}") as {
      reasons?: string[];
      explanation?: string;
      buyerPersona?: string;
      fitsStore?: boolean;
      summary?: string;
    };

    return {
      ...input.analysis,
      reasons:
        Array.isArray(parsed.reasons) && parsed.reasons.length > 0
          ? parsed.reasons.slice(0, 8).map(String)
          : input.analysis.reasons,
      explanation: parsed.explanation || input.analysis.explanation,
      market: {
        ...input.analysis.market,
        buyerPersona: parsed.buyerPersona || input.analysis.market.buyerPersona,
        fitsStore:
          typeof parsed.fitsStore === "boolean"
            ? parsed.fitsStore
            : input.analysis.market.fitsStore,
        summary: parsed.summary || input.analysis.market.summary,
      },
    };
  } catch (error) {
    logError(error, "[merchandiser/market-ai]");
    return input.analysis;
  }
}
