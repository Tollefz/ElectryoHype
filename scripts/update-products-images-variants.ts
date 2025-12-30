import "dotenv/config";
import { prisma } from "../lib/prisma";
import { getScraperForUrl } from "../lib/scrapers/server";
import { identifySupplier } from "../lib/scrapers";

/**
 * Script for å oppdatere alle produkter med faktiske bilder og varianter fra leverandør-URLer
 * 
 * Bruk:
 * npm run update:products
 */

const USD_TO_NOK_RATE = 10.5;
const PROFIT_MARGIN = 2; // 100% margin
const COMPARE_AT_PRICE_MULTIPLIER = 1.5;

interface UpdateResult {
  success: boolean;
  productId: string;
  productName: string;
  imagesUpdated?: boolean;
  variantsAdded?: number;
  error?: string;
}

async function updateProduct(productId: string, supplierUrl: string): Promise<UpdateResult> {
  try {
    console.log(`\n🔍 Oppdaterer produkt ${productId}...`);
    console.log(`📄 URL: ${supplierUrl.substring(0, 80)}...`);

    // Hent produktet
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: true },
    });

    if (!product) {
      return {
        success: false,
        productId,
        productName: "Unknown",
        error: "Produkt ikke funnet",
      };
    }

    console.log(`📦 Produkt: ${product.name}`);

    // Scrape produktdata
    const scraper = getScraperForUrl(supplierUrl);
    if (!scraper) {
      return {
        success: false,
        productId,
        productName: product.name,
        error: "Kunne ikke identifisere scraper for URL",
      };
    }

    const result = await scraper.scrapeProduct(supplierUrl);

    if (!result.success || !result.data) {
      return {
        success: false,
        productId,
        productName: product.name,
        error: result.error || "Ukjent feil ved scraping",
      };
    }

    const data = result.data;
    console.log(`✅ Scrapet data: ${data.title}`);

    // Oppdater bilder - ALLTID hent nye bilder fra leverandøren
    let imagesUpdated = false;
    let images: string[] = [];
    
    // PRIORITET 1: Hent bilder fra URL-parametere (mer pålitelig)
    try {
      const urlParams = new URL(supplierUrl).searchParams;
      const topGalleryUrl = urlParams.get('top_gallery_url');
      if (topGalleryUrl) {
        const decodedImage = decodeURIComponent(topGalleryUrl);
        if (decodedImage.startsWith('http')) {
          images.push(decodedImage);
          console.log("✅ Fant hovedbilde fra URL-parameter");
        }
      }
    } catch (e) {
      console.warn("⚠️ Kunne ikke parse URL for bilder:", e);
    }

    // PRIORITET 2: Hent bilder fra scraping (faktiske bilder fra siden)
    if (data.images && data.images.length > 0) {
      // Filtrer ut duplikater og ikke-gyldige bilder
      const validImages = data.images.filter((img: string) => {
        if (!img || typeof img !== 'string') return false;
        if (!img.startsWith('http')) return false;
        
        // Aksepter bilder fra kjente CDNer
        const isFromKnownCDN = 
          img.includes('alicdn.com') ||
          img.includes('temu.com') ||
          img.includes('kwcdn.com') ||
          img.includes('ebayimg.com') ||
          img.includes('img.kwcdn.com');
        
        // Eller har bilde-endelse
        const hasImageExtension = img.match(/\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i);
        
        // Filtrer ut logoer, ikoner, etc.
        const imgLower = img.toLowerCase();
        const isNotLogo = !imgLower.includes('logo') && 
                         !imgLower.includes('icon') && 
                         !imgLower.includes('avatar') &&
                         !imgLower.includes('spinner') &&
                         !imgLower.includes('loading');
        
        return (isFromKnownCDN || hasImageExtension) && isNotLogo;
      });
      
      // Legg til nye bilder (uten duplikater)
      validImages.forEach((img: string) => {
        if (!images.includes(img)) {
          images.push(img);
        }
      });
      
      if (validImages.length > 0) {
        imagesUpdated = true;
        console.log(`✅ Hentet ${validImages.length} bilder fra scraping`);
      }
    }
    
    // Hvis vi fortsatt ikke har bilder, behold eksisterende (men markér som ikke oppdatert)
    if (images.length === 0) {
      const existingImages = typeof product.images === "string" ? JSON.parse(product.images) : product.images || [];
      if (Array.isArray(existingImages) && existingImages.length > 0) {
        images = existingImages;
        console.log("⚠️ Bruker eksisterende bilder (kunne ikke hente nye)");
      }
    } else {
      imagesUpdated = true;
    }

    // Hvis fortsatt ingen bilder, prøv flere metoder
    if (images.length === 0 || images.filter((img: string) => img && img.startsWith('http')).length === 0) {
      try {
        const urlParams = new URL(supplierUrl).searchParams;
        
        // Prøv flere URL-parametere som kan inneholde bilder
        const imageParams = ['top_gallery_url', 'image_url', 'img_url', 'gallery_url', 'photo_url', 'product_image'];
        for (const param of imageParams) {
          const imageUrl = urlParams.get(param);
          if (imageUrl) {
            const decodedImage = decodeURIComponent(imageUrl);
            if (decodedImage.startsWith('http') && !images.includes(decodedImage)) {
              images.push(decodedImage);
              imagesUpdated = true;
              console.log(`✅ Fant bilde fra URL-parameter: ${param}`);
              break;
            }
          }
        }
        
        // For Alibaba: Prøv å finne bilde-ID i URL
        if (supplierUrl.includes('alibaba.com') && images.length === 0) {
          const imageIdMatch = supplierUrl.match(/image(\d+)/i) || supplierUrl.match(/gallery[_-]?id[=_-](\d+)/i);
          if (imageIdMatch) {
            // Kunne konstruere bilde-URL, men dette krever mer informasjon
            console.log(`📸 Fant bilde-ID i URL, men kan ikke konstruere URL uten mer info`);
          }
        }
      } catch (e) {
        console.warn("⚠️ Kunne ikke hente bilder fra URL-parametere:", e);
      }
    }
    
    // Behold eksisterende bilder hvis de ser ut som gyldige URLer
    if (images.length > 0) {
      images = images.filter((img: string) => {
        if (!img || typeof img !== 'string') return false;
        // Aksepter bilder fra kjente CDNer eller har bilde-endelse
        return img.startsWith('http') && (
          img.includes('alicdn.com') ||
          img.includes('temu.com') ||
          img.includes('kwcdn.com') ||
          img.includes('ebayimg.com') ||
          img.match(/\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i)
        );
      });
      
      if (images.length > 0) {
        imagesUpdated = true;
        console.log(`✅ Har ${images.length} gyldige bilder`);
      }
    }

    // Håndter varianter
    let variantsAdded = 0;
    const existingVariants = product.variants || [];
    
    if (data.variants && data.variants.length > 1) {
      // Slett eksisterende varianter
      await prisma.productVariant.deleteMany({
        where: { productId },
      });

      // Finn base pris for varianter
      const basePrice = product.supplierPrice ? Number(product.supplierPrice) : 
                       (data.price?.amount ? data.price.amount * USD_TO_NOK_RATE : 99);

      // Filtrer ut ugyldige varianter (f.eks. navigasjonstekst, lenker, etc.)
      const validVariants = data.variants.filter((variant: any) => {
        if (!variant || !variant.name) return false;
        const name = variant.name.toLowerCase().trim();
        
        // Filtrer ut ugyldige varianter
        const invalidPatterns = [
          'eller fortsett',
          'lær mer',
          'se mer',
          'klikk her',
          'neste',
          'previous',
          'next',
          'se alle',
          'vis alle',
          'more',
          'less',
          'read more',
          'read less',
        ];
        
        // Sjekk om navnet er en ugyldig variant
        const isInvalid = invalidPatterns.some(pattern => name.includes(pattern));
        if (isInvalid) return false;
        
        // Variant-navn bør være kort (maks 50 tegn)
        if (variant.name.length > 50) return false;
        
        // Variant bør ha en pris
        if (!variant.price || variant.price <= 0) {
          // Hvis ingen pris, bruk base pris
          variant.price = basePrice / USD_TO_NOK_RATE;
        }
        
        return true;
      });
      
      // Hvis alle varianter ble filtrert ut, ikke legg til varianter
      if (validVariants.length === 0) {
        console.log("⚠️ Ingen gyldige varianter funnet etter filtrering");
      } else {
        // Opprett nye varianter
        const variantData = validVariants.map((variant: any) => {
          const variantSupplierPriceNok = Math.round(variant.price * USD_TO_NOK_RATE);
          const variantSellingPriceNok = Math.round(variantSupplierPriceNok * PROFIT_MARGIN);
          const variantCompareAtPriceNok = variant.compareAtPrice
            ? Math.round(variant.compareAtPrice * USD_TO_NOK_RATE * PROFIT_MARGIN)
            : Math.round(variantSellingPriceNok * COMPARE_AT_PRICE_MULTIPLIER);

          return {
            name: variant.name.trim(),
            price: variantSellingPriceNok,
            compareAtPrice: variantCompareAtPriceNok,
            supplierPrice: variantSupplierPriceNok,
            image: variant.image || images[0] || null,
            attributes: variant.attributes || {},
            stock: variant.stock || 10,
            isActive: true,
          };
        });

        await prisma.productVariant.createMany({
          data: variantData.map((v: any) => ({
            ...v,
            productId,
          })),
        });

        variantsAdded = variantData.length;
        console.log(`✅ Lagt til ${variantsAdded} gyldige varianter (filtrert fra ${data.variants.length})`);
    } else {
      // Prøv å finne varianter fra URL eller produktnavn
      const urlLower = supplierUrl.toLowerCase();
      const productNameLower = product.name.toLowerCase();
      const categoryLower = (product.category || "").toLowerCase();

      // Sjekk for fargevarianter
      let colorVariants: Array<{ name: string; attributes: Record<string, string> }> = [];
      
      // Vanlige farger
      const colors = ["Svart", "Hvit", "Grå", "Rød", "Blå", "Grønn", "Gul", "Rosa", "Lilla", "Oransje", "Beige", "Brun"];
      
      // Sjekk om produktet har fargevarianter (fra URL eller navn)
      const hasColorOptions = urlLower.includes("color") || urlLower.includes("farge") || 
                              urlLower.includes("rød") || urlLower.includes("blå") ||
                              productNameLower.includes("farge") || productNameLower.includes("color");
      
      // Sjekk for størrelsesvarianter (klær)
      const isClothing = categoryLower === "klær" || 
                         productNameLower.includes("tskjorte") || productNameLower.includes("t-skjorte") ||
                         productNameLower.includes("genser") || productNameLower.includes("hette") ||
                         productNameLower.includes("jakke") || productNameLower.includes("bukser") ||
                         productNameLower.includes("kjole") || productNameLower.includes("skjorte");
      
      // Sjekk for lengdevarianter (kabler, etc.)
      const isCable = productNameLower.includes("kabel") || productNameLower.includes("cable") ||
                      urlLower.includes("ft") || urlLower.includes("meter") || urlLower.includes("m-");
      
      // For klær: legg til størrelse- og fargevarianter
      if (isClothing) {
        const sizes = ["S", "M", "L", "XL", "XXL"];
        const baseColors = hasColorOptions ? colors.slice(0, 4) : ["Svart", "Hvit", "Grå"];
        
        baseColors.forEach(color => {
          sizes.forEach(size => {
            colorVariants.push({
              name: `${color} - ${size}`,
              attributes: { color, size },
            });
          });
        });
        console.log(`👕 Detektert klær: Lagt til ${colorVariants.length} farge/størrelse-varianter`);
      }
      // For kabler: legg til lengdevarianter
      else if (isCable) {
        // Prøv å finne lengder fra URL eller navn
        const lengthMatches = urlLower.match(/(\d+(?:\.\d+)?)\s*(?:ft|fot|m|meter|cm|centimeter)/gi) || 
                             productNameLower.match(/(\d+(?:\.\d+)?)\s*(?:ft|fot|m|meter|cm|centimeter)/gi) || [];
        
        if (lengthMatches.length > 0) {
          // Fjern duplikater
          const uniqueLengths = Array.from(new Set(lengthMatches.map((m: string) => m.trim())));
          uniqueLengths.slice(0, 6).forEach((match: string) => {
            colorVariants.push({
              name: `Lengde: ${match}`,
              attributes: { length: match },
            });
          });
        } else {
          // Standard lengdevarianter basert på produkttype
          const lengths = isCable && productNameLower.includes('lader') ? ["1m", "2m"] :
                         isCable && productNameLower.includes('kabel') ? ["1m", "2m", "3m", "5m"] :
                         ["1m", "2m", "3m"];
          lengths.forEach(length => {
            colorVariants.push({
              name: `Lengde: ${length}`,
              attributes: { length },
            });
          });
        }
        console.log(`🔌 Detektert kabel: Lagt til ${colorVariants.length} lengdevarianter`);
      }
      // For andre produkter: legg til fargevarianter hvis relevant
      else if (hasColorOptions || 
               // Sjekk om produktet typisk har farger (elektronikk kan ha farger)
               categoryLower === "elektronikk" || categoryLower === "mobil & tilbehør" ||
               productNameLower.includes("case") || productNameLower.includes("cover") ||
               productNameLower.includes("veske") || productNameLower.includes("bag") ||
               productNameLower.includes("hylster") || productNameLower.includes("beskyttelse") ||
               productNameLower.includes("glass") || productNameLower.includes("film")) {
        // For produkter med fargevarianter: legg til 3-5 vanlige farger
        const relevantColors = hasColorOptions ? colors.slice(0, 5) : colors.slice(0, 3);
        relevantColors.forEach(color => {
          colorVariants.push({
            name: color,
            attributes: { color },
          });
        });
        console.log(`🎨 Detektert fargevarianter: Lagt til ${colorVariants.length} farger`);
      }
      
      // For produkter som kan ha størrelser (ikke klær)
      if (!isClothing && !isCable && colorVariants.length === 0) {
        // Sjekk for størrelse i navnet
        const hasSize = productNameLower.includes("stor") || productNameLower.includes("liten") ||
                       productNameLower.includes("mini") || productNameLower.includes("maxi") ||
                       urlLower.includes("size");
        if (hasSize) {
          const sizes = ["S", "M", "L"];
          sizes.forEach(size => {
            colorVariants.push({
              name: `Størrelse: ${size}`,
              attributes: { size },
            });
          });
          console.log(`📏 Detektert størrelsesvarianter: Lagt til ${colorVariants.length} størrelser`);
        }
      }

      if (colorVariants.length > 0) {
        // Slett eksisterende varianter
        await prisma.productVariant.deleteMany({
          where: { productId },
        });

        // Opprett varianter
        const basePrice = product.supplierPrice ? Number(product.supplierPrice) : 99;
        const variantData = colorVariants.map((variant) => {
          const variantSellingPriceNok = Math.round(basePrice * PROFIT_MARGIN);
          const variantCompareAtPriceNok = Math.round(variantSellingPriceNok * COMPARE_AT_PRICE_MULTIPLIER);

          return {
            productId,
            name: variant.name,
            price: variantSellingPriceNok,
            compareAtPrice: variantCompareAtPriceNok,
            supplierPrice: basePrice,
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
        console.log(`✅ Lagt til ${variantsAdded} varianter basert på produkttype`);
      }
    }

    // Oppdater produktet
    const updateData: any = {};
    
    if (imagesUpdated && images.length > 0) {
      updateData.images = JSON.stringify(images);
    }

    // Oppdater base pris hvis vi har variant-priser
    if (data.variants && data.variants.length > 0) {
      const basePrice = Math.min(...data.variants.map((v: any) => v.price));
      const baseSupplierPriceNok = Math.round(basePrice * USD_TO_NOK_RATE);
      const baseSellingPriceNok = Math.round(baseSupplierPriceNok * PROFIT_MARGIN);
      const baseCompareAtPriceNok = Math.round(baseSellingPriceNok * COMPARE_AT_PRICE_MULTIPLIER);

      updateData.price = baseSellingPriceNok;
      updateData.compareAtPrice = baseCompareAtPriceNok;
      updateData.supplierPrice = baseSupplierPriceNok;
    } else if (data.price && data.price.amount) {
      const supplierPriceNok = Math.round(data.price.amount * USD_TO_NOK_RATE);
      const sellingPriceNok = Math.round(supplierPriceNok * PROFIT_MARGIN);
      const compareAtPriceNok = Math.round(sellingPriceNok * COMPARE_AT_PRICE_MULTIPLIER);

      updateData.price = sellingPriceNok;
      updateData.compareAtPrice = compareAtPriceNok;
      updateData.supplierPrice = supplierPriceNok;
    }

    // ALLTID oppdater beskrivelse hvis vi fikk en fra scraping
    if (data.description && data.description.trim().length > 10) {
      updateData.description = data.description;
      const shortDesc = data.description.substring(0, 150).trim();
      updateData.shortDescription = shortDesc + (data.description.length > 150 ? "..." : "");
      console.log(`✅ Oppdatert beskrivelse (${data.description.length} tegn)`);
    }

    // Oppdater specs hvis de finnes
    if (data.specs && Object.keys(data.specs).length > 0) {
      updateData.specs = data.specs;
    }

    // ALLTID oppdater produktet hvis vi har data
    if (images.length > 0) {
      updateData.images = JSON.stringify(images);
    }
    
    // Oppdater produktnavn hvis det er bedre enn eksisterende
    if (data.title && data.title.trim().length > 10 && data.title !== product.name) {
      // Sjekk om scrapet tittel er bedre (lengre, mer detaljert)
      if (data.title.length > product.name.length || data.title.includes(product.name)) {
        updateData.name = data.title;
        console.log(`✅ Oppdatert produktnavn: "${data.title}"`);
      }
    }
    
    if (Object.keys(updateData).length > 0) {
      await prisma.product.update({
        where: { id: productId },
        data: updateData,
      });
      console.log(`✅ Produktet er oppdatert med: ${Object.keys(updateData).join(", ")}`);
    }

    return {
      success: true,
      productId,
      productName: product.name,
      imagesUpdated,
      variantsAdded,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    console.error(`❌ Feil ved oppdatering av produkt ${productId}:`, message);
    return {
      success: false,
      productId,
      productName: "Unknown",
      error: message,
    };
  }
}

async function main() {
  console.log("🚀 Starter oppdatering av produkter med bilder og varianter...\n");

  // Hent alle produkter med supplierUrl
  const products = await prisma.product.findMany({
    where: {
      supplierUrl: { not: null },
    },
    select: {
      id: true,
      name: true,
      supplierUrl: true,
      supplierName: true,
      category: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`📦 Fant ${products.length} produkter med supplierUrl\n`);

  if (products.length === 0) {
    console.log("⚠️ Ingen produkter med supplierUrl funnet!");
    process.exit(0);
  }

  const results: UpdateResult[] = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    if (!product.supplierUrl) continue;

    console.log(`\n[${i + 1}/${products.length}]`);
    const result = await updateProduct(product.id, product.supplierUrl);
    results.push(result);

    // Vent litt mellom hver oppdatering for å unngå rate limiting
    if (i < products.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  // Oppsummering
  console.log("\n" + "=".repeat(60));
  console.log("📊 OPPDATERINGSOPSUMMERING");
  console.log("=".repeat(60));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const withImages = results.filter((r) => r.imagesUpdated);
  const withVariants = results.filter((r) => r.variantsAdded && r.variantsAdded > 0);

  console.log(`✅ Vellykket: ${successful.length}`);
  console.log(`❌ Feilet: ${failed.length}`);
  console.log(`🖼️  Oppdatert med bilder: ${withImages.length}`);
  console.log(`🎨 Oppdatert med varianter: ${withVariants.length}`);
  console.log(`📦 Totalt: ${results.length}`);

  if (successful.length > 0) {
    console.log("\n✅ Vellykkede oppdateringer:");
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
      console.log(`   • ${r.productName}: ${r.error}`);
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

