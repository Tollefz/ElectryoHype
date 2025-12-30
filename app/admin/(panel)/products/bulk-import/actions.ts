"use server";

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import slugify from "slugify";
import { improveTitle } from "@/lib/utils/improve-product-title";
import { safeQuery } from "@/lib/safeQuery";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getProviderRegistry } from "@/lib/providers/server-only";
import type { BulkImportResult } from "@/lib/providers";

const USD_TO_NOK_RATE = 10.5;
const PROFIT_MARGIN = 2.0; // 100% margin
const COMPARE_AT_PRICE_MULTIPLIER = 1.3;

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(2, 6);
}

async function importProduct(
  inputUrl: string,
  providerName?: string
): Promise<BulkImportResult> {
  try {
    const registry = getProviderRegistry();
    
    // Get provider (by name or auto-detect)
    const provider = registry.getProviderForUrl(url, providerName);
    
    const warnings: string[] = [];
    
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
      const errorMessage = error instanceof Error ? error.message : "Ukjent feil";
      console.error(`[Bulk Import] Error fetching product from ${providerUsed}:`, {
        url: normalizedUrl,
        error: errorMessage,
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
    const description = data.description || "";
    const shortDescription = description.substring(0, 150) + (description.length > 150 ? "..." : "");

    // Håndter varianter
    const hasVariants = data.variants && data.variants.length > 1;
    const variants = data.variants || [];

    // CRITICAL: Collect ALL images from product AND variants
    const allImagesSet = new Set<string>();
    
    baseImages.forEach((img: string) => {
      if (img && img.startsWith('http') && !img.includes('placeholder')) {
        allImagesSet.add(img);
      }
    });
    
    variants.forEach((variant: any) => {
      if (variant.image && 
          variant.image.startsWith('http') && 
          !variant.image.includes('placeholder') &&
          !variant.image.includes('placehold.co')) {
        allImagesSet.add(variant.image);
      }
    });

    const variantImages = variants
      .map((v: any) => v.image)
      .filter((img: string) => img && img.startsWith('http') && !img.includes('placeholder'));

    const images = [
      ...variantImages.filter((img: string, idx: number, arr: string[]) => arr.indexOf(img) === idx),
      ...Array.from(allImagesSet).filter(img => !variantImages.includes(img))
    ];

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

    // Base price
    let basePrice = variants.length > 0 ? Math.min(...variants.map((v) => v.price)) : data.price.amount;

    if (!basePrice || basePrice === 0) {
      basePrice = 9.99;
    }

    // Konverter pris til NOK
    const baseSupplierPriceNok = Math.round(basePrice * USD_TO_NOK_RATE);
    const baseSellingPriceNok = Math.round(baseSupplierPriceNok * PROFIT_MARGIN);
    const baseCompareAtPriceNok = Math.round(baseSellingPriceNok * COMPARE_AT_PRICE_MULTIPLIER);

    // Forbedre produkt-tittel
    const improvedTitle = improveTitle(data.title);
    
    const sku = `${providerUsed.toUpperCase()}-${generateId().toUpperCase()}`;
    const slugBase = slugify(improvedTitle, { lower: true, strict: true });
    const slug = `${slugBase}-${generateId().substring(0, 4)}`;

    // Opprett produkt med varianter
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
          tags: data.specs ? JSON.stringify(Object.keys(data.specs).slice(0, 10)) : JSON.stringify([]),
          category,
          sku,
          isActive: true,
          storeId: DEFAULT_STORE_ID,
          supplierUrl: normalizedUrl,
          supplierName: providerUsed,
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
    } catch (dbError) {
      console.error(`[Bulk Import] Database error creating product:`, {
        url: normalizedUrl,
        provider: providerUsed,
        error: dbError instanceof Error ? dbError.message : "Ukjent database-feil",
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

    // Check for warnings
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
    const errorMessage = error instanceof Error ? error.message : "Ukjent feil";
    console.error(`[Bulk Import] Unexpected error:`, {
      url: inputUrl,
      error: errorMessage,
    });
    
    return {
      inputUrl,
      normalizedUrl: inputUrl,
      providerUsed: "unknown",
      status: "error",
      message: "En uventet feil oppstod under import. Prøv igjen senere.",
      warnings: [],
    };
  }
}

export async function importProducts(formData: FormData) {
  const session = await getAuthSession();
  if (!session?.user) {
    return { error: "Unauthorized", results: [] };
  }

  try {
    const urlsText = formData.get("urls") as string;
    const providerName = formData.get("provider") as string | null;
    
    if (!urlsText) {
      return { error: "URL-er er påkrevd", results: [] };
    }

    // Parse URLs from textarea (one per line)
    const urlList = urlsText
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url.length > 0 && (url.startsWith("http://") || url.startsWith("https://")));

    if (urlList.length === 0) {
      return { error: "Ingen gyldige URL-er funnet", results: [] };
    }

    // Importer alle produkter sekvensielt
    // Continue even if individual URLs fail
    const results: BulkImportResult[] = [];
    
    for (let i = 0; i < urlList.length; i++) {
      const url = urlList[i];
      
      try {
        const result = await importProduct(url, providerName || undefined);
        results.push(result);
      } catch (error) {
        // Log error but continue with next URL
        console.error(`[Bulk Import] Error processing URL ${i + 1}/${urlList.length}:`, {
          url,
          error: error instanceof Error ? error.message : "Ukjent feil",
        });
        
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
      if (i < urlList.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return { results, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil ved bulk import";
    return { error: message, results: [] };
  }
}

