import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logError, logInfo } from "@/lib/utils/logger";

/**
 * AI Helper API for Admin
 * 
 * Generates product descriptions, SEO content, and marketing copy using OpenAI.
 * 
 * IMPORTANT: Set OPENAI_API_KEY in Vercel environment variables for this to work.
 * 
 * If OpenAI SDK is not installed, this uses fetch() directly to OpenAI API.
 * To use the official SDK instead, install: npm install openai
 */

interface AIRequest {
  type: "productDescription" | "seo" | "heroCopy";
  payload: {
    name?: string;
    category?: string;
    price?: number;
    toneOfVoice?: "nøytral" | "entusiastisk" | "teknisk";
    useCase?: string;
    description?: string;
    campaignName?: string;
    productTypes?: string;
    discount?: number;
  };
}

export async function POST(req: Request) {
  try {
    // Admin auth check
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { ok: false, error: "Ikke autentisert" },
        { status: 401 }
      );
    }

    const body: AIRequest = await req.json();
    const { type, payload } = body;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logError(new Error("OPENAI_API_KEY not set"), "[api/admin/ai]");
      return NextResponse.json(
        {
          ok: false,
          error: "OpenAI API-nøkkel ikke konfigurert. Sett OPENAI_API_KEY i Vercel environment variables.",
        },
        { status: 500 }
      );
    }

    let prompt = "";
    let systemPrompt = "Du er en ekspert på produktbeskrivelser og markedsføring for norske nettbutikker. Skriv alltid på norsk.";

    switch (type) {
      case "productDescription": {
        const { name, category, price, toneOfVoice = "nøytral", useCase } = payload;
        prompt = `Skriv en profesjonell produktbeskrivelse for følgende produkt:

Navn: ${name || "Ikke spesifisert"}
Kategori: ${category || "Ikke spesifisert"}
Pris: ${price ? `${price} kr` : "Ikke spesifisert"}
${useCase ? `Bruksområde: ${useCase}` : ""}

Tone: ${toneOfVoice}

Skriv:
1. En kort, fengende innledning (1-2 setninger)
2. En hovedbeskrivelse (3-5 setninger) som fremhever produktets hovedfunksjoner og fordeler
3. En liste med 3-5 bullet points med nøkkelfordeler

Formatér svaret som JSON:
{
  "description": "hovedbeskrivelsen her",
  "bullets": ["fordel 1", "fordel 2", "fordel 3"]
}`;
        break;
      }

      case "seo": {
        const { name, category, description } = payload;
        prompt = `Generer SEO-optimalisert innhold for følgende produkt:

Navn: ${name || "Ikke spesifisert"}
Kategori: ${category || "Ikke spesifisert"}
Beskrivelse: ${description || "Ikke spesifisert"}

Generer:
1. En SEO-tittel (50-60 tegn, inkluder produktnavn og kategori)
2. En meta-beskrivelse (140-160 tegn, fengende og informativ)

Formatér svaret som JSON:
{
  "title": "SEO-tittel her",
  "description": "Meta-beskrivelse her"
}`;
        break;
      }

      case "heroCopy": {
        const { campaignName, productTypes, discount } = payload;
        prompt = `Skriv hero-tekst for en kampanje:

Kampanjenavn: ${campaignName || "Ukens tilbud"}
Produkttyper: ${productTypes || "Elektronikk"}
Rabatt: ${discount ? `${discount}%` : "Ikke spesifisert"}

Generer:
1. En fengende hovedtittel (maks 60 tegn)
2. En undertekst (maks 120 tegn)
3. CTA-tekst (maks 20 tegn, f.eks. "Se tilbud" eller "Kjøp nå")

Formatér svaret som JSON:
{
  "title": "Hovedtittel her",
  "subtitle": "Undertekst her",
  "cta": "CTA-tekst her"
}`;
        break;
      }

      default:
        return NextResponse.json(
          { ok: false, error: "Ugyldig type" },
          { status: 400 }
        );
    }

    // Call OpenAI API using fetch (no SDK required)
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Cost-effective model
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logError(
        new Error(`OpenAI API error: ${response.status} ${JSON.stringify(errorData)}`),
        "[api/admin/ai]"
      );
      return NextResponse.json(
        {
          ok: false,
          error: `OpenAI API feil: ${errorData.error?.message || "Ukjent feil"}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { ok: false, error: "Ingen respons fra AI" },
        { status: 500 }
      );
    }

    // Parse JSON response
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      // If not valid JSON, wrap in description field
      result = { description: content };
    }

    logInfo(`AI generated ${type} successfully`, "[api/admin/ai]");

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error: any) {
    logError(error, "[api/admin/ai]");
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Ukjent feil ved AI-generering",
      },
      { status: 500 }
    );
  }
}

