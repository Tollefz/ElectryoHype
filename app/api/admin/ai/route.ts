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
  type: "productDescription" | "seo" | "heroCopy" | "categoryCopy" | "emailTemplate";
  payload: {
    // ProductDescription
    name?: string;
    category?: string;
    price?: number;
    tone?: "nøytral" | "entusiastisk" | "teknisk";
    toneOfVoice?: "nøytral" | "entusiastisk" | "teknisk"; // Legacy support
    notes?: string;
    useCase?: string; // Legacy support
    description?: string;
    shortDescription?: string;
    // SEO
    pageType?: "product" | "category" | "frontpage" | "other";
    // CategoryCopy
    categoryName?: string;
    productsHint?: string;
    // HeroCopy
    campaignName?: string;
    focus?: string;
    discountInfo?: string;
    productTypes?: string; // Legacy support
    discount?: number; // Legacy support
    // EmailTemplate
    templateType?: "welcome" | "campaign" | "newsletter";
    audienceDescription?: string;
    offerDescription?: string;
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
        const { name, category, price, tone = "nøytral", toneOfVoice, notes, useCase } = payload;
        const finalTone = tone || toneOfVoice || "nøytral";
        const extraNotes = notes || useCase || "";
        prompt = `Skriv en profesjonell produktbeskrivelse for følgende produkt:

Navn: ${name || "Ikke spesifisert"}
Kategori: ${category || "Ikke spesifisert"}
Pris: ${price ? `${price} kr` : "Ikke spesifisert"}
${extraNotes ? `Stikkord/bruksområde: ${extraNotes}` : ""}

Tone: ${finalTone}

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
        const { name, category, description, shortDescription, pageType = "product" } = payload;
        const pageTypeText = 
          pageType === "product" ? "produktside" :
          pageType === "category" ? "kategoriside" :
          pageType === "frontpage" ? "forside" : "side";
        const desc = description || shortDescription || "Ikke spesifisert";
        prompt = `Generer SEO-optimalisert innhold for en ${pageTypeText}:

Navn/tittel: ${name || "Ikke spesifisert"}
Kategori: ${category || "Ikke spesifisert"}
Beskrivelse: ${desc}

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
        const { campaignName, focus, discountInfo, productTypes, discount } = payload;
        const focusText = focus || productTypes || "Elektronikk";
        const discountText = discountInfo || (discount ? `${discount}% rabatt` : "");
        prompt = `Skriv hero-tekst for en kampanje:

Kampanjenavn: ${campaignName || "Ukens tilbud"}
Fokus: ${focusText}
Rabattinfo: ${discountText || "Ikke spesifisert"}

Generer:
1. En fengende hovedtittel (headline, maks 60 tegn)
2. En undertekst (subheadline, maks 120 tegn)
3. Primær CTA-tekst (maks 20 tegn, f.eks. "Se tilbud" eller "Kjøp nå")
4. Sekundær CTA-tekst (valgfritt, maks 20 tegn, f.eks. "Se alle produkter")

Formatér svaret som JSON:
{
  "headline": "Hovedtittel her",
  "subheadline": "Undertekst her",
  "ctaPrimary": "Primær CTA her",
  "ctaSecondary": "Sekundær CTA her (valgfritt)"
}`;
        break;
      }

      case "categoryCopy": {
        const { categoryName, productsHint, tone = "nøytral" } = payload;
        prompt = `Skriv kategori-tekst for følgende kategori:

Kategorinavn: ${categoryName || "Ikke spesifisert"}
Produkter i kategorien: ${productsHint || "Ikke spesifisert"}
Tone: ${tone}

Generer:
1. En kort introduksjonstekst (2-3 setninger) som beskriver kategorien
2. En kort blurb (1 setning) som kan brukes i kort visning

Formatér svaret som JSON:
{
  "intro": "Introduksjonstekst her",
  "shortBlurb": "Kort blurb her"
}`;
        break;
      }

      case "emailTemplate": {
        const { templateType, audienceDescription, offerDescription } = payload;
        const templateName = 
          templateType === "welcome" ? "velkomst-e-post" :
          templateType === "campaign" ? "kampanje-e-post" :
          templateType === "newsletter" ? "nyhetsbrev" : "e-post";
        
        prompt = `Skriv en ${templateName} for en norsk nettbutikk:

Målgruppe: ${audienceDescription || "Generell kundebase"}
Tilbud/tema: ${offerDescription || "Ikke spesifisert"}

Generer:
1. En fengende emnelinje (subject, maks 50 tegn)
2. En preheader-tekst (maks 100 tegn, vises i e-postklienter)
3. E-postinnhold i HTML-format (bodyHtml) med:
   - En hilsen
   - Hovedbudskapet
   - En klar call-to-action
   - En avslutning
   
Bruk enkel HTML: <h1>, <p>, <a>, <strong>. Ingen kompleks styling.

Formatér svaret som JSON:
{
  "subject": "Emnelinje her",
  "preheader": "Preheader-tekst her",
  "bodyHtml": "<h1>Tittel</h1><p>Innhold...</p><a href='#'>CTA</a>"
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

