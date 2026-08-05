import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import slugify from "slugify";
import { improveTitle } from "@/lib/utils/improve-product-title";
import { safeQuery } from "@/lib/safeQuery";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getProviderRegistry } from "@/lib/providers/server-only";
import type { BulkImportResult } from "@/lib/providers";
import { SupplierName, Prisma } from "@prisma/client";
import { sanitizeDescriptionWithFallback } from "@/lib/import/sanitizeDescription";
import {
  calculateCompareAtPrice,
  calculateSuggestedRetailPrice,
  convertPriceToNOK,
} from "@/lib/import/pricing";
import { categorizeForSave } from "@/lib/categories/apply-on-save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(2, 6);
}

interface ImportVariant {
  image?: string | null;
  name?: string;
  price?: number;
  [key: string]: unknown;
}

/**
 * Map provider name string to SupplierName enum value
 * Returns null if provider name doesn't match any known supplier
 */
function mapProviderToSupplierName(providerName: string): SupplierName | null {
  const normalized = providerName.toLowerCase().trim();
  
  // Map known provider names to SupplierName enum values
  if (normalized === "alibaba") {
    return SupplierName.alibaba;
  }
  if (normalized === "ebay") {
    return SupplierName.ebay;
  }
  if (normalized === "temu") {
    return SupplierName.temu;
  }
  if (normalized === "cj" || normalized === "cjdropshipping") {
    return SupplierName.cj;
  }
  if (normalized === "aliexpress") {
    return SupplierName.aliexpress;
  }
  
  // Unknown provider
  return null;
}

async function importProduct(
  inputUrl: string,
  providerName?: string
): Promise<BulkImportResult> {
  const registry = getProviderRegistry();
  const warnings: string[] = [];
  
  try {
    // Auto-detect provider if not specified
    const provider = registry.getProviderForUrl(inputUrl, providerName);
    
    if (!provider) {
      const detectedProviders = registry.getAllProviders().map(p => p.getName()).join(", ");
      return {
        inputUrl,
        normalizedUrl: inputUrl,
        providerUsed: "none",
        status: "error",
        message: `Ustøttet leverandør. Støttede: ${detectedProviders}`,
        warnings,
      };
    }

    const providerUsed = provider.getName();

    // Normalize URL
    const normalizedUrl = provider.normalizeUrl(inputUrl);

    // Fetch raw product data
    let rawProduct;
    try {
      rawProduct = await provider.fetchProduct(normalizedUrl);
    } catch (error) {
      // Log detailed error server-side
      const errorMessage = error instanceof Error ? error.message : "Ukjent feil";
      console.error(`[Bulk Import] Error fetching product from ${providerUsed}:`, {
        url: normalizedUrl,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      return {
        inputUrl,
        normalizedUrl,
        providerUsed,
        status: "error",
        message: "Kunne ikke hente produktdata. Sjekk at URL-en er korrekt og at produktet eksisterer.",
        warnings,
      };
    }

    // Check for warnings in raw product metadata
    if (rawProduct.metadata?.warnings && Array.isArray(rawProduct.metadata.warnings)) {
      warnings.push(...rawProduct.metadata.warnings);
    }

    // Map to our product format
    const data = provider.mapToProduct(rawProduct, normalizedUrl);

    // Sjekk om produktet allerede eksisterer (bruk normalisert URL)
    const existing = await safeQuery(
      () =>
        prisma.product.findFirst({
          where: {
            supplierUrl: normalizedUrl,
          },
        }),
      null,
      "admin:bulk-import:existing"
    );

    if (existing) {
      return {
        inputUrl,
        normalizedUrl,
        providerUsed,
        status: "warning",
        message: `Produktet eksisterer allerede: ${existing.name}`,
        warnings: [...warnings, "Produktet ble ikke opprettet fordi det allerede finnes i databasen"],
      };
    }

    // Forbered data
    const baseImages = data.images || [];
    
    // Sanitize description to remove supplier references
    const rawDescription = data.description || "";
    const description = sanitizeDescriptionWithFallback(
      rawDescription,
      "Dette produktet er en del av vårt utvalg av elektronikk og tilbehør. Vi leverer kvalitetsprodukter med fokus på funksjonalitet og verdi."
    );
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
    variants.forEach((variant: ImportVariant) => {
      if (variant.image && 
          variant.image.startsWith('http') && 
          !variant.image.includes('placeholder') &&
          !variant.image.includes('placehold.co')) {
        allImagesSet.add(variant.image);
      }
    });
    
    // Convert to array, ensuring variant images are first (they're usually more specific)
    const variantImages = variants
      .map((v: ImportVariant) => v.image)
      .filter((img): img is string => !!img && img.startsWith('http') && !img.includes('placeholder'));
    
    const images = [
      ...variantImages.filter((img: string, idx: number, arr: string[]) => arr.indexOf(img) === idx), // Unique variant images first
      ...Array.from(allImagesSet).filter(img => !variantImages.includes(img)) // Then other images
    ];
    
    console.log(`[Bulk Import] Collected ${images.length} total images (${baseImages.length} base + ${variantImages.length} variant images)`);

    // Base price — keep supplier currency from scrape (NOK for Temu /no). Never invent 9.99 USD.
    const currency = (data.price.currency || "NOK").toUpperCase();
    const positiveVariantPrices = variants.map((v) => v.price).filter((p) => p > 0);
    let basePrice =
      positiveVariantPrices.length > 0
        ? Math.min(...positiveVariantPrices)
        : data.price.amount;

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      basePrice = data.price.amount > 0 ? data.price.amount : 0;
    }

    const baseSupplierPriceNok = Math.round(convertPriceToNOK(basePrice, currency) * 100) / 100;
    if (baseSupplierPriceNok <= 0) {
      throw new Error(
        "Kunne ikke hente Temu/leverandørpris. Import avvist — ingen USD-plassholder brukes."
      );
    }
    const baseSellingPriceNok = calculateSuggestedRetailPrice(baseSupplierPriceNok);
    const baseCompareAtPriceNok = calculateCompareAtPrice(baseSellingPriceNok);

    const improvedTitle = improveTitle(data.title);
    const sku = `${providerUsed.toUpperCase()}-${generateId().toUpperCase()}`;
    const slugBase = slugify(improvedTitle, { lower: true, strict: true });
    const slug = `${slugBase}-${generateId().substring(0, 4)}`;

    // Category Engine — never trust legacy keyword maps / Elektronikk
    const categoryPersist = await categorizeForSave({
      title: improvedTitle,
      description: description || shortDescription,
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
      variants: variants.map((v) => String((v as { name?: string }).name || "")),
      supplierCategory: null,
      existingSpecs: data.specs || {},
    });

    // Opprett produkt med varianter
    // CRITICAL: Set storeId to DEFAULT_STORE_ID so products appear in frontend
    let product;
    try {
      product = await prisma.product.create({
        data: {
          name: improvedTitle,
          slug,
          description: description || shortDescription,
          shortDescription,
          price: baseSellingPriceNok,
          compareAtPrice: baseCompareAtPriceNok,
          supplierPrice: baseSupplierPriceNok,
          images: JSON.stringify(images),
          tags: categoryPersist.tags,
          category: categoryPersist.category,
          subcategory: categoryPersist.subcategory,
          specs: categoryPersist.specsPatch as Prisma.InputJsonValue,
          sku,
          isActive: true,
          storeId: DEFAULT_STORE_ID, // Set storeId so products appear in frontend
          supplierUrl: normalizedUrl,
          supplierName: mapProviderToSupplierName(providerUsed),
          aiCategorySuggested: categoryPersist.aiCategorySuggested,
          aiCategoryConfidence: categoryPersist.aiCategoryConfidence,
          aiCategoryReason: categoryPersist.aiCategoryReason,
          aiCategoryStatus: categoryPersist.aiCategoryStatus,
          aiCategoryAt: categoryPersist.aiCategoryAt,
        variants: hasVariants
          ? {
              create: variants.map((variant, index) => {
                const variantSupplierPriceNok = Math.round(convertPriceToNOK(variant.price, "USD"));
                const variantSellingPriceNok = calculateSuggestedRetailPrice(variantSupplierPriceNok);
                const variantCompareAtPriceNok = calculateCompareAtPrice(variantSellingPriceNok);

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
    } catch (dbError) {
      // Log detailed database error server-side
      console.error(`[Bulk Import] Database error creating product:`, {
        url: normalizedUrl,
        provider: providerUsed,
        error: dbError instanceof Error ? dbError.message : "Ukjent database-feil",
        stack: dbError instanceof Error ? dbError.stack : undefined,
      });
      
      return {
        inputUrl,
        normalizedUrl,
        providerUsed,
        status: "error",
        message: "Kunne ikke lagre produktet i databasen. Prøv igjen senere.",
        warnings,
      };
    }

    // Check for warnings (e.g., missing images, low price, etc.)
    if (images.length === 0) {
      warnings.push("Ingen bilder funnet for produktet");
    }
    if (basePrice < 1) {
      warnings.push("Pris ser ut til å være ugyldig eller manglende");
    }

    return {
      inputUrl,
      normalizedUrl,
      providerUsed,
      status: warnings.length > 0 ? "warning" : "success",
      message: `Produkt importert: ${product.name}`,
      createdProductId: product.id,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    // Log detailed error server-side
    const errorMessage = error instanceof Error ? error.message : "Ukjent feil";
    console.error(`[Bulk Import] Unexpected error:`, {
      url: inputUrl,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    return {
      inputUrl,
      normalizedUrl: inputUrl,
      providerUsed: "unknown",
      status: "error",
      message: "En uventet feil oppstod under import. Prøv igjen senere.",
      warnings,
    };
  }
}

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { urls, provider } = await req.json();

    // Validate request body
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "URL-er er påkrevd (array)" }, { status: 400 });
    }

    // Validate provider if specified
    if (provider && typeof provider !== "string") {
      return NextResponse.json({ error: "Provider må være en string" }, { status: 400 });
    }

    if (provider && !["temu", "alibaba"].includes(provider.toLowerCase())) {
      return NextResponse.json({ error: `Ustøttet provider: ${provider}. Støttede: temu, alibaba` }, { status: 400 });
    }

    // Validate all URLs
    const invalidUrls: string[] = [];
    for (const url of urls) {
      if (typeof url !== "string" || (!url.startsWith("http://") && !url.startsWith("https://"))) {
        invalidUrls.push(url);
      }
    }

    if (invalidUrls.length > 0) {
      return NextResponse.json({ 
        error: `Ugyldige URL-er funnet: ${invalidUrls.slice(0, 3).join(", ")}${invalidUrls.length > 3 ? "..." : ""}` 
      }, { status: 400 });
    }

    // Import all products sequentially (to avoid overload)
    // Continue even if individual URLs fail
    const results: BulkImportResult[] = [];
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      try {
        // Auto-detect provider per URL if not specified
        const result = await importProduct(url, provider);
        results.push(result);
      } catch (error) {
        // Log error but continue with next URL
        console.error(`[Bulk Import] Error processing URL ${i + 1}/${urls.length}:`, {
          url,
          error: error instanceof Error ? error.message : "Ukjent feil",
          stack: error instanceof Error ? error.stack : undefined,
        });
        
        // Add error result
        results.push({
          inputUrl: url,
          normalizedUrl: url,
          providerUsed: "unknown",
          status: "error",
          message: "En uventet feil oppstod under import av denne URL-en.",
          warnings: [],
        });
      }

      // Rate limiting: wait between requests (except for last one)
      if (i < urls.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // Return results
    return NextResponse.json({ results });
  } catch (error) {
    // Log detailed error server-side
    console.error("[Bulk Import] Fatal error:", {
      error: error instanceof Error ? error.message : "Ukjent feil",
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    const message = error instanceof Error ? error.message : "Ukjent feil ved bulk import";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}