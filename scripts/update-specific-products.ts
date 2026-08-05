import "dotenv/config";
import { prisma } from "../lib/prisma";
import { getScraperForUrl } from "../lib/scrapers/server";
import {
  calculateCompareAtPrice,
  calculateSuggestedRetailPrice,
} from "../lib/import/pricing";

/**
 * Script for å oppdatere spesifikke produkter med faktiske bilder og varianter
 * Basert på produkter vist på skjermbilde
 */

// Produkter som skal oppdateres basert på skjermbilde
const PRODUCTS_TO_UPDATE = [
  { name: "Hettegenser Komfort", category: "Klær", hasColors: true, hasSizes: true },
  { name: "T-skjorte Premium", category: "Klær", hasColors: true, hasSizes: true },
  { name: "Minimalistisk Bordlampe", category: "Hjem", hasColors: true, hasSizes: false },
  { name: "Duftlys Sett", category: "Hjem", hasColors: true, hasSizes: false },
  { name: "Yogaboller Sett", category: "Sport", hasColors: true, hasSizes: false },
  { name: "Treningsmatte Deluxe", category: "Sport", hasColors: true, hasSizes: false },
  { name: "Trådløs Mus", category: "Elektronikk", hasColors: true, hasSizes: false },
  { name: "Smartklokke Pro", category: "Elektronikk", hasColors: true, hasSizes: false },
  { name: "Premium Hodetelefoner", category: "Elektronikk", hasColors: true, hasSizes: false },
];

const COLORS = ["Svart", "Hvit", "Grå", "Rød", "Blå", "Grønn", "Rosa", "Lilla"];
const SIZES = ["S", "M", "L", "XL", "XXL"];

async function updateProduct(productId: string, productName: string, supplierUrl: string | null, config: typeof PRODUCTS_TO_UPDATE[0]) {
  try {
    console.log(`\n🔍 Oppdaterer: ${productName}`);

    // Hent produktet
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: true },
    });

    if (!product) {
      console.log(`❌ Produkt ikke funnet: ${productName}`);
      return { success: false, productName };
    }

    let images: string[] = typeof product.images === "string" ? JSON.parse(product.images) : product.images || [];
    let imagesUpdated = false;

    // Hvis produktet har supplierUrl, prøv å hente bilder
    if (supplierUrl) {
      try {
        const urlParams = new URL(supplierUrl).searchParams;
        const topGalleryUrl = urlParams.get('top_gallery_url');
        if (topGalleryUrl) {
          const decodedImage = decodeURIComponent(topGalleryUrl);
          if (decodedImage.startsWith('http') && !images.includes(decodedImage)) {
            images = [decodedImage, ...images.filter((img: string) => img !== decodedImage)];
            imagesUpdated = true;
            console.log(`✅ Fant hovedbilde fra URL`);
          }
        }

        // Prøv å scrape for flere bilder
        try {
          const scraper = getScraperForUrl(supplierUrl);
          if (scraper) {
            const result = await scraper.scrapeProduct(supplierUrl);
            if (result.success && result.data?.images && result.data.images.length > 0) {
              const newImages = result.data.images.filter((img: string) => !images.includes(img));
              if (newImages.length > 0) {
                images = [...images, ...newImages];
                imagesUpdated = true;
                console.log(`✅ Lagt til ${newImages.length} bilder fra scraping`);
              }
            }
          }
        } catch (e) {
          console.warn(`⚠️ Kunne ikke scrape bilder: ${e}`);
        }
      } catch (e) {
        console.warn(`⚠️ Kunne ikke hente bilder fra URL: ${e}`);
      }
    }

    // Filtrer ut ugyldige bilder
    images = images.filter((img: string) => {
      if (!img || typeof img !== 'string') return false;
      return img.startsWith('http') && (
        img.includes('alicdn.com') ||
        img.includes('temu.com') ||
        img.includes('kwcdn.com') ||
        img.includes('ebayimg.com') ||
        img.match(/\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i)
      );
    });

    // Oppdater bilder hvis vi fant nye
    if (images.length > 0) {
      await prisma.product.update({
        where: { id: productId },
        data: { images: JSON.stringify(images) },
      });
      imagesUpdated = true;
    }

    // Opprett varianter
    let variantsAdded = 0;
    if (config.hasColors || config.hasSizes) {
      // Slett eksisterende varianter
      await prisma.productVariant.deleteMany({
        where: { productId },
      });

      const variants: Array<{ name: string; attributes: Record<string, string> }> = [];

      if (config.hasColors && config.hasSizes) {
        // Klær: kombinasjon av farger og størrelser
        const colorsToUse = COLORS.slice(0, 4); // Bruk 4 første farger
        colorsToUse.forEach(color => {
          SIZES.forEach(size => {
            variants.push({
              name: `${color} - ${size}`,
              attributes: { color, size },
            });
          });
        });
      } else if (config.hasColors) {
        // Bare farger
        COLORS.slice(0, 5).forEach(color => {
          variants.push({
            name: color,
            attributes: { color },
          });
        });
      } else if (config.hasSizes) {
        // Bare størrelser
        SIZES.forEach(size => {
          variants.push({
            name: `Størrelse: ${size}`,
            attributes: { size },
          });
        });
      }

      if (variants.length > 0) {
        // Med kjent leverandørpris brukes den dynamiske priskurven;
        // ellers beholdes produktets eksisterende salgspris.
        const supplierPriceNok = product.supplierPrice ? Number(product.supplierPrice) : null;

        const variantData = variants.map((variant) => {
          const variantSellingPriceNok = supplierPriceNok
            ? calculateSuggestedRetailPrice(supplierPriceNok)
            : Math.round(Number(product.price));
          const variantCompareAtPriceNok = calculateCompareAtPrice(variantSellingPriceNok);

          return {
            productId,
            name: variant.name,
            price: variantSellingPriceNok,
            compareAtPrice: variantCompareAtPriceNok,
            supplierPrice: supplierPriceNok,
            image: images[0] || null,
            attributes: variant.attributes,
            stock: 10,
            isActive: true,
          };
        });

        await prisma.productVariant.createMany({
          data: variantData,
        });

        variantsAdded = variantData.length;
        console.log(`✅ Lagt til ${variantsAdded} varianter`);
      }
    }

    return {
      success: true,
      productName,
      imagesUpdated,
      variantsAdded,
    };
  } catch (error) {
    console.error(`❌ Feil ved oppdatering av ${productName}:`, error);
    return {
      success: false,
      productName,
      error: error instanceof Error ? error.message : "Ukjent feil",
    };
  }
}

async function main() {
  console.log("🚀 Starter oppdatering av spesifikke produkter...\n");

  const results: Array<{ success: boolean; productName: string; imagesUpdated?: boolean; variantsAdded?: number; error?: string }> = [];

  for (const config of PRODUCTS_TO_UPDATE) {
    // Søk etter produktet i databasen
    // Prøv først eksakt match, deretter delmatch
    let products = await prisma.product.findMany({
      where: {
        name: {
          contains: config.name,
        },
      },
      take: 5,
    });
    
    // Hvis ikke funnet, prøv med case-insensitive søk
    if (products.length === 0) {
      const allProducts = await prisma.product.findMany({
        take: 1000, // Hent mange for å søke gjennom
      });
      products = allProducts.filter(p => 
        p.name.toLowerCase().includes(config.name.toLowerCase())
      );
    }
    
    // Ta første match
    products = products.slice(0, 1);

    if (products.length === 0) {
      console.log(`⚠️ Fant ikke produkt: ${config.name}`);
      results.push({ success: false, productName: config.name, error: "Ikke funnet i database" });
      continue;
    }

    const product = products[0];
    console.log(`📦 Fant: ${product.name} (${product.supplierUrl ? "har URL" : "ingen URL"})`);

    const result = await updateProduct(
      product.id,
      product.name,
      product.supplierUrl,
      config
    );

    results.push(result);

    // Kort pause mellom produkter
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Oppsummering
  console.log("\n" + "=".repeat(60));
  console.log("📊 OPPSUMERING");
  console.log("=".repeat(60));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const withImages = results.filter((r) => r.imagesUpdated);
  const withVariants = results.filter((r) => r.variantsAdded && r.variantsAdded > 0);

  console.log(`✅ Vellykket: ${successful.length}/${results.length}`);
  console.log(`❌ Feilet: ${failed.length}/${results.length}`);
  console.log(`🖼️  Oppdatert med bilder: ${withImages.length}`);
  console.log(`🎨 Oppdatert med varianter: ${withVariants.length}`);

  if (successful.length > 0) {
    console.log("\n✅ Oppdaterte produkter:");
    successful.forEach((r) => {
      const updates = [];
      if (r.imagesUpdated) updates.push("bilder");
      if (r.variantsAdded && r.variantsAdded > 0) updates.push(`${r.variantsAdded} varianter`);
      console.log(`   • ${r.productName}${updates.length > 0 ? ` (${updates.join(", ")})` : ""}`);
    });
  }

  if (failed.length > 0) {
    console.log("\n❌ Feilede oppdateringer:");
    failed.forEach((r) => {
      console.log(`   • ${r.productName}: ${r.error || "Ukjent feil"}`);
    });
  }

  console.log("\n" + "=".repeat(60));
}

main()
  .catch((error) => {
    console.error("❌ Kritisk feil:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

