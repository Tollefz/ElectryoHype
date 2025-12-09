import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * API route for å scrape produkter fra Alibaba, Temu eller eBay
 * POST /api/admin/scrape-product
 * Body: { url: string, supplier?: string }
 */
export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL er påkrevd" }, { status: 400 });
    }

    // Valider URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Ugyldig URL format" }, { status: 400 });
    }

    // Identifiser leverandør FØRST (uten å laste scrapers)
    // Import ONLY from supplier-identifier which has NO Puppeteer dependencies
    const { identifySupplier } = await import("@/lib/scrapers/supplier-identifier");
    const supplier = identifySupplier(url);
    
    if (!supplier) {
      return NextResponse.json(
        { error: "Ustøttet leverandør. Støttede leverandører: Alibaba, Temu, eBay" },
        { status: 400 }
      );
    }

    console.log(`[Scrape Product] Scraping ${supplier} produkt fra: ${url}`);

    // For Temu, import ONLY TemuScraper (no Puppeteer)
    // CRITICAL: Use dynamic import with explicit file path to avoid bundling Puppeteer
    let result;
    try {
      if (supplier === "temu") {
        // Direct import of TemuScraper only - no Puppeteer loaded
        // Use explicit relative path to ensure no bundling of other scrapers
        console.log(`[Scrape Product] Loading TemuScraper directly (no Puppeteer)...`);
        const temuScraperModule = await import("@/lib/scrapers/temu-scraper");
        const TemuScraper = temuScraperModule.TemuScraper;
        const scraper = new TemuScraper();
        console.log(`[Scrape Product] TemuScraper loaded, starting scrape...`);
        result = await scraper.scrapeProduct(url);
        console.log(`[Scrape Product] Temu scrape completed`);
        console.log(`[Scrape Product] Variants count: ${result.data?.variants?.length || 0}`);
        if (result.data?.variants && result.data.variants.length > 0) {
          console.log(`[Scrape Product] Variants found:`, JSON.stringify(result.data.variants.slice(0, 2), null, 2));
        }
      } else {
        // Use general scrapeProduct for Alibaba/eBay (loads Puppeteer only when needed)
        console.log(`[Scrape Product] Loading scraper for ${supplier}...`);
        const { scrapeProduct } = await import("@/lib/scrapers");
        result = await scrapeProduct(url);
      }
    } catch (error) {
      console.error(`[Scrape Product] Exception during scraping:`, error);
      const errorMessage = error instanceof Error ? error.message : "Ukjent feil ved scraping";
      return NextResponse.json(
        {
          error: errorMessage,
          supplier,
          hint: supplier === "temu" 
            ? "Temu kan være vanskelig å scrape. Prøv å kopiere URL direkte fra produktets side." 
            : "Prøv å oppdatere siden og sjekk at URL-en er korrekt.",
        },
        { status: 500 }
      );
    }

    if (!result.success || !result.data) {
      const errorMessage = result.error || "Kunne ikke hente produktdata";
      console.error(`[Scrape Product] Feil: ${errorMessage}`);
      return NextResponse.json(
        {
          error: errorMessage,
          supplier,
          hint: supplier === "temu" 
            ? "Temu kan være vanskelig å scrape. Prøv å kopiere URL direkte fra produktets side." 
            : undefined,
        },
        { status: 500 }
      );
    }

    const data = result.data;

    // Konverter valuta til NOK (forenklet - burde bruke faktisk valuta-konvertering)
    const priceInNOK = data.price.currency === "USD" 
      ? data.price.amount * 10.5  // Omtrentlig USD til NOK kurs
      : data.price.amount;

    // Beregn foreslått salgspris (50% fortjeneste)
    const suggestedPrice = Math.round(priceInNOK * 1.5);
    const compareAtPrice = Math.round(suggestedPrice * 1.15);

    // Formater beskrivelse
    const description = data.description || "";
    const shortDescription = data.title.length > 150 
      ? data.title.substring(0, 147) + "..." 
      : data.title;

    // Hent bilder
    const images = Array.isArray(data.images) && data.images.length > 0
      ? data.images.slice(0, 10) // Maks 10 bilder
      : [];

    // Generer tags basert på specs
    const tags: string[] = [];
    if (data.specs) {
      tags.push(...Object.keys(data.specs).slice(0, 5));
    }

    // Ensure variants always exist - create default if missing
    let variants = data.variants;
    if (!variants || !Array.isArray(variants) || variants.length === 0) {
      console.log(`[Scrape Product] ⚠️ No variants in data, creating default variant`);
      variants = [{
        name: "Standard",
        price: Math.round(priceInNOK),
        compareAtPrice: undefined,
        supplierPrice: Math.round(priceInNOK),
        image: images.length > 0 ? images[0] : undefined,
        attributes: {},
        stock: 10,
      }];
    } else {
      // Ensure all variants have the correct structure for saving
      variants = variants.map(v => ({
        name: v.name || "Standard",
        price: typeof v.price === 'number' ? Math.round(v.price * (v.price < 100 ? 10.5 : 1)) : Math.round(priceInNOK), // Convert USD to NOK if needed
        compareAtPrice: v.compareAtPrice ? Math.round(v.compareAtPrice * (v.compareAtPrice < 100 ? 10.5 : 1)) : undefined,
        supplierPrice: v.supplierPrice || Math.round(priceInNOK / 1.5), // Estimate supplier price
        image: v.image || (images.length > 0 ? images[0] : undefined),
        attributes: v.attributes || {},
        stock: v.stock || 10,
      }));
    }

    // Forbedre produkt-tittel automatisk
    const { improveTitle } = await import("@/lib/utils/improve-product-title");
    const improvedTitle = improveTitle(data.title);

    const responseData = {
      name: improvedTitle,
      price: Math.round(priceInNOK),
      suggestedPrice,
      compareAtPrice,
      description,
      shortDescription,
      category: "Elektronikk", // Default - kan forbedres senere
      images,
      tags,
      supplier,
      specs: data.specs || {},
      shippingEstimate: data.shippingEstimate,
      variants: variants, // Always include variants (at least one)
    };

    console.log(`[Scrape Product] Response data - variants: ${responseData.variants.length}`);
    console.log(`[Scrape Product] Sending variants in response:`, JSON.stringify(responseData.variants.slice(0, 3), null, 2));

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[Scrape Product] Exception:", error);
    const message = error instanceof Error ? error.message : "Ukjent feil ved scraping";
    return NextResponse.json(
      {
        error: message,
        hint: "Sjekk at URL-en er korrekt og at produktet fortsatt eksisterer på leverandørens nettside.",
      },
      { status: 500 }
    );
  }
}

