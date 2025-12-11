/**
 * Shared utility for calling the admin AI API
 * Used by both GlobalAIAssistant and per-product AI helpers
 */

export type AIType = "productDescription" | "seo" | "heroCopy" | "categoryCopy" | "emailTemplate";

export interface AIRequestPayload {
  // ProductDescription
  name?: string;
  category?: string;
  price?: number;
  tone?: "nøytral" | "entusiastisk" | "teknisk";
  notes?: string;
  // SEO
  shortDescription?: string;
  pageType?: "product" | "category" | "frontpage" | "other";
  // CategoryCopy
  categoryName?: string;
  productsHint?: string;
  // HeroCopy
  campaignName?: string;
  focus?: string;
  discountInfo?: string;
  // EmailTemplate
  templateType?: "welcome" | "campaign" | "newsletter";
  audienceDescription?: string;
  offerDescription?: string;
  // Legacy fields (for backward compatibility)
  toneOfVoice?: "nøytral" | "entusiastisk" | "teknisk";
  useCase?: string;
  description?: string;
  productTypes?: string;
  discount?: number;
}

export interface AIResponse {
  ok: boolean;
  result?: any;
  error?: string;
}

/**
 * Call the admin AI API
 */
export async function callAdminAI(
  type: AIType,
  payload: AIRequestPayload
): Promise<AIResponse> {
  try {
    const response = await fetch("/api/admin/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || "Kunne ikke generere innhold",
      };
    }

    return {
      ok: true,
      result: data.result,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ukjent feil",
    };
  }
}

