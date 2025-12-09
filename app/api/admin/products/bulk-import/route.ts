import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import slugify from "slugify";
import { improveTitle } from "@/lib/utils/improve-product-title";

export const dynamic = "force-dynamic";

const USD_TO_NOK_RATE = 10.5;
const PROFIT_MARGIN = 2.0; // 100% margin
const COMPARE_AT_PRICE_MULTIPLIER = 1.3;

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(2, 6);
}

interface ImportResult {
  success: boolean;
  url: string;
  productName?: string;
  error?: string;
  images?: number;
  price?: number;
  variants?: number;
}

async function importProduct(url: string): Promise<ImportResult> {
  try {
    // Identifiser leverandør FØRST (uten å laste Puppeteer)
    // Import ONLY from supplier-identifier which has NO Puppeteer dependencies
    const { identifySupplier } = await import("@/lib/scrapers/supplier-identifier");
    const supplier = identifySupplier(url);
    
    if (!supplier) {
      return {
        success: false,
        url,
        error: "Ustøttet leverandør. Støttede: Alibaba, Temu, eBay",
      };
    }
    
    // For Temu, import ONLY TemuScraper (no Puppeteer)
    // For others, use getScraperForUrl
    let scraper;
    if (supplier === "temu") {
      const { TemuScraper } = await import("@/lib/scrapers/temu-scraper");
      scraper = new TemuScraper();
    } else {
      // Lazy import scrapers for other suppliers
      const { getScraperForUrl } = await import("@/lib/scrapers");
      scraper = await getScraperForUrl(url);
    }
    if (!scraper) {
      return {
        success: false,
        url,
        error: "Ustøttet leverandør. Støttede: Alibaba, Temu, eBay",
      };
    }

    // Scrape produktet
    const result = await scraper.scrapeProduct(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        url,
        error: result.error || "Ukjent feil ved scraping",
      };
    }

    const data = result.data;

    // Sjekk om produktet allerede eksisterer
    const existing = await prisma.product.findFirst({
      where: {
        supplierUrl: url,
      },
    });

    if (existing) {
      return {
        success: false,
        url,
        productName: existing.name,
        error: "Produktet eksisterer allerede",
      };
    }

    // Forbered data
    const baseImages = data.images || [];
    const description = data.description || "";
    const shortDescription = description.substring(0, 150) + (description.length > 150 ? "..." : "");

    // Håndter varianter
    const hasVariants = data.variants && data.variants.length > 1;
    const variants = data.variants || [];

    // CRITICAL: Collect ALL images from product AND variants
    // This ensures all variant images are available in the product's images array
    const allImagesSet = new Set<string>();
    
    // Add base product images
    baseImages.forEach((img: string) => {
      if (img && img.startsWith('http') && !img.includes('placeholder')) {
        allImagesSet.add(img);
      }
    });
    
    // Add variant images
    variants.forEach((variant: any) => {
      if (variant.image && 
          variant.image.startsWith('http') && 
          !variant.image.includes('placeholder') &&
          !variant.image.includes('placehold.co')) {
        allImagesSet.add(variant.image);
      }
    });
    
    // Convert to array, ensuring variant images are first (they're usually more specific)
    const variantImages = variants
      .map((v: any) => v.image)
      .filter((img: string) => img && img.startsWith('http') && !img.includes('placeholder'));
    
    const images = [
      ...variantImages.filter((img: string, idx: number, arr: string[]) => arr.indexOf(img) === idx), // Unique variant images first
      ...Array.from(allImagesSet).filter(img => !variantImages.includes(img)) // Then other images
    ];
    
    console.log(`[Bulk Import] Collected ${images.length} total images (${baseImages.length} base + ${variantImages.length} variant images)`);

    // Bestem kategori
    let category = "Elektronikk";
    const titleLower = data.title.toLowerCase();
    if (titleLower.includes("phone") || titleLower.includes("iphone") || titleLower.includes("mobil")) {
      category = "Mobil & Tilbehør";
    } else if (
      titleLower.includes("computer") ||
      titleLower.includes("laptop") ||
      titleLower.includes("pc") ||
      titleLower.includes("tastatur") ||
      titleLower.includes("keyboard")
    ) {
      category = "Datamaskiner";
    } else if (titleLower.includes("tv") || titleLower.includes("speaker") || titleLower.includes("høyttaler")) {
      category = "TV & Lyd";
    } else if (titleLower.includes("game") || titleLower.includes("gaming")) {
      category = "Gaming";
    } else if (titleLower.includes("home") || titleLower.includes("hjem")) {
      category = "Hjem & Fritid";
    }

    // Base price (laveste variant pris eller hovedpris)
    let basePrice = variants.length > 0 ? Math.min(...variants.map((v) => v.price)) : data.price.amount;

    // If price is 0 or missing, use a default estimated price
    if (!basePrice || basePrice === 0) {
      basePrice = 9.99; // Default estimated price in USD for Temu products
    }

    // Konverter pris til NOK
    const baseSupplierPriceNok = Math.round(basePrice * USD_TO_NOK_RATE);
    const baseSellingPriceNok = Math.round(baseSupplierPriceNok * PROFIT_MARGIN);
    const baseCompareAtPriceNok = Math.round(baseSellingPriceNok * COMPARE_AT_PRICE_MULTIPLIER);

    // Forbedre produkt-tittel automatisk
    const improvedTitle = improveTitle(data.title);
    
    // Generer unik SKU og slug basert på forbedret tittel
    const sku = `TEMU-${generateId().toUpperCase()}`;
    const slugBase = slugify(improvedTitle, { lower: true, strict: true });
    const slug = `${slugBase}-${generateId().substring(0, 4)}`;

    // Opprett produkt med varianter
    const product = await prisma.product.create({
      data: {
        name: improvedTitle,
        slug,
        description: description || shortDescription,
        shortDescription,
        price: baseSellingPriceNok,
        compareAtPrice: baseCompareAtPriceNok,
        supplierPrice: baseSupplierPriceNok,
        images: JSON.stringify(images),
        tags: data.specs ? JSON.stringify(Object.keys(data.specs).slice(0, 10)) : JSON.stringify([]),
        category,
        sku,
        isActive: true,
        supplierUrl: url,
        supplierName: "temu",
        variants: hasVariants
          ? {
              create: variants.map((variant, index) => {
                const variantSupplierPriceNok = Math.round(variant.price * USD_TO_NOK_RATE);
                const variantSellingPriceNok = Math.round(variantSupplierPriceNok * PROFIT_MARGIN);
                const variantCompareAtPriceNok = variant.compareAtPrice
                  ? Math.round(variant.compareAtPrice * USD_TO_NOK_RATE * PROFIT_MARGIN)
                  : Math.round(variantSellingPriceNok * COMPARE_AT_PRICE_MULTIPLIER);

                return {
                  name: variant.name,
                  sku: `${sku}-V${index + 1}`,
                  price: variantSellingPriceNok,
                  compareAtPrice: variantCompareAtPriceNok,
                  supplierPrice: variantSupplierPriceNok,
                  image: variant.image || null,
                  attributes: variant.attributes || {},
                  stock: variant.stock || 0,
                  isActive: true,
                };
              }),
            }
          : undefined,
      },
      include: {
        variants: true,
      },
    });

    return {
      success: true,
      url,
      productName: product.name,
      images: images.length,
      price: baseSellingPriceNok,
      variants: hasVariants && "variants" in product && product.variants ? product.variants.length : 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return {
      success: false,
      url,
      error: message,
    };
  }
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { urls } = await req.json();

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "URL-er er påkrevd (array)" }, { status: 400 });
    }

    // Valider alle URL-er
    for (const url of urls) {
      if (typeof url !== "string" || (!url.startsWith("http://") && !url.startsWith("https://"))) {
        return NextResponse.json({ error: `Ugyldig URL: ${url}` }, { status: 400 });
      }
    }

    // Importer alle produkter sekvensielt (for å unngå overload)
    const results: ImportResult[] = [];
    for (const url of urls) {
      const result = await importProduct(url);
      results.push(result);

      // Vent litt mellom hver import for å unngå rate limiting
      if (urls.indexOf(url) < urls.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[Bulk Import] Error:", error);
    const message = error instanceof Error ? error.message : "Ukjent feil ved bulk import";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}