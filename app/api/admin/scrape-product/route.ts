import "server-only";

import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { scrapeProduct as scrapeProductServer } from "@/lib/server/scrape-product";
import {
  calculateCompareAtPrice,
  calculateSuggestedRetailPrice,
  convertPriceToNOK,
} from "@/lib/import/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * API route for å scrape produkter fra Alibaba, Temu eller eBay
 * POST /api/admin/scrape-product
 * Body: { url: string, provider?: string }
 */
export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { url, provider } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL er påkrevd" }, { status: 400 });
    }

    // Valider URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Ugyldig URL format" }, { status: 400 });
    }

    // Get supplier for error messages
    const { identifySupplier } = await import("@/lib/scrapers/supplier-identifier");
    const supplier = identifySupplier(url) || (provider?.toLowerCase() as "temu" | "alibaba" | "ebay" | undefined);

    // Call server-only scraping function
    let result;
    try {
      result = await scrapeProductServer(url, provider);
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

    const data = result.data!;

    // Konverter valuta til NOK
    const priceInNOK = convertPriceToNOK(data.price.amount, data.price.currency || "USD");

    // Beregn foreslått salgspris via den dynamiske priskurven
    const suggestedPrice = calculateSuggestedRetailPrice(priceInNOK);
    const compareAtPrice = calculateCompareAtPrice(suggestedPrice);

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

    const { categorizeForSave } = await import("@/lib/categories/apply-on-save");
    const categoryPersist = await categorizeForSave({
      title: improvedTitle,
      description,
      shortDescription,
      specs: data.specs
        ? Object.fromEntries(
            Object.entries(data.specs as Record<string, unknown>).map(([k, v]) => [
              k,
              String(v ?? ""),
            ])
          )
        : {},
      images,
      variants: variants.map((v: { name?: string }) => String(v.name || "")),
      supplierCategory: null,
    });

    const responseData = {
      name: improvedTitle,
      price: Math.round(priceInNOK),
      suggestedPrice,
      compareAtPrice,
      description,
      shortDescription,
      category: categoryPersist.category,
      subcategory: categoryPersist.subcategory,
      images,
      tags: JSON.parse(categoryPersist.tags) as string[],
      supplier,
      specs: data.specs || {},
      shippingEstimate: data.shippingEstimate,
      variants: variants, // Always include variants (at least one)
      aiCategoryConfidence: categoryPersist.aiCategoryConfidence,
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
