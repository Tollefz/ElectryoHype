import "dotenv/config";
import { PrismaClient } from '@prisma/client';
import { TemuScraper } from '../lib/scrapers/temu-scraper';
import { cleanProductName } from '../lib/utils/url-decode';

const prisma = new PrismaClient();
const scraper = new TemuScraper();

async function updateAllProducts() {
  try {
    console.log('🔍 Henter alle produkter med supplierUrl...\n');
    
    // Hent alle aktive produkter med supplierUrl
    const products = await prisma.product.findMany({
      where: {
        supplierUrl: {
          not: null,
        },
        supplierName: {
          in: ['temu'],
        },
        isActive: true,
      },
      include: {
        variants: true,
      },
    });

    console.log(`✅ Fant ${products.length} produkter med Temu URL\n`);
    console.log('=' .repeat(60));

    const results = {
      updated: 0,
      skipped: 0,
      errors: 0,
      totalVariants: 0,
    };

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const supplierUrl = product.supplierUrl!;
      
      console.log(`\n[${i + 1}/${products.length}] 📦 ${product.name.substring(0, 60)}...`);
      console.log(`   URL: ${supplierUrl.substring(0, 80)}...`);

      try {
        // Scrape produktdata fra Temu
        console.log('   🌐 Henter data fra Temu...');
        const scrapeResult = await scraper.scrapeProduct(supplierUrl);

        if (!scrapeResult.success || !scrapeResult.data) {
          console.log(`   ⚠️  Kunne ikke hente data: ${scrapeResult.error || 'Ukjent feil'}`);
          results.skipped++;
          continue;
        }

        const data = scrapeResult.data;
        console.log(`   ✅ Data hentet: ${data.title ? 'Ja' : 'Nei'}, ${data.variants?.length || 0} varianter`);

        // Clean product name
        const cleanedTitle = cleanProductName(data.title || product.name);
        const currentNameClean = cleanProductName(product.name);
        
        // Sjekk om navn skal oppdateres (alltid oppdater hvis det er bedre/dekodet)
        const shouldUpdateName = cleanedTitle && 
          cleanedTitle !== currentNameClean && 
          cleanedTitle.length > 10 &&
          !cleanedTitle.includes('%'); // Ikke oppdater hvis det fortsatt er URL-enkodet
        
        // Sjekk om beskrivelse skal oppdateres (alltid hvis ny er bedre/lengre)
        const shouldUpdateDescription = data.description && 
          data.description.trim().length > 50 &&
          (!product.description || data.description.trim().length > product.description.length);

        // Beregn pris fra Temu (konverter USD til NOK hvis nødvendig)
        let temuPriceNOK: number | null = null;
        if (data.price && data.price.amount > 0) {
          if (data.price.currency === 'USD') {
            temuPriceNOK = Math.round(data.price.amount * 10.5); // USD til NOK
          } else {
            temuPriceNOK = Math.round(data.price.amount);
          }
        }

        // Sjekk om pris skal oppdateres (hvis det er en signifikant forskjell)
        const shouldUpdatePrice = temuPriceNOK && 
          Math.abs(temuPriceNOK - Number(product.price)) > 5 &&
          temuPriceNOK > 0 && temuPriceNOK < 10000; // Rimelig pris

        // Forbered varianter
        let variantsToCreate: any[] = [];
        
        // Hvis scraperen fant varianter, bruk dem
        if (data.variants && data.variants.length > 0) {
          // Hent alle bilder for å matche til varianter
          let allImages: string[] = [];
          try {
            const productImages = typeof product.images === 'string' 
              ? JSON.parse(product.images) 
              : (Array.isArray(product.images) ? product.images : []);
            allImages = data.images && data.images.length > 0 ? data.images : productImages;
          } catch {
            allImages = data.images || [];
          }

          // Konverter variant-priser fra USD til NOK
          variantsToCreate = data.variants.map((variant, index) => {
            let variantPriceNOK: number;
            if (variant.price && variant.price > 0) {
              // Anta USD hvis prisen er under 100, ellers antageligvis NOK
              if (variant.price < 100) {
                variantPriceNOK = Math.round(variant.price * 10.5); // USD til NOK
              } else {
                variantPriceNOK = Math.round(variant.price);
              }
            } else {
              // Bruk produktets base pris hvis variant ikke har pris
              variantPriceNOK = Number(product.price);
            }

            // Beregn salgspris (legg til profittmargin)
            const supplierPrice = variantPriceNOK;
            const profitMargin = product.supplierPrice && product.supplierPrice > 0
              ? (Number(product.price) - Number(product.supplierPrice)) / Number(product.supplierPrice)
              : 1.0; // 100% margin som standard
            
            const sellingPrice = Math.round(supplierPrice * (1 + profitMargin));
            const compareAtPrice = product.compareAtPrice 
              ? Math.round(sellingPrice * (Number(product.compareAtPrice) / Number(product.price)))
              : Math.round(sellingPrice * 1.5);

            // Prøv å finne bildet for denne varianten
            let variantImage: string | null = null;
            
            // 1. Bruk variant.image hvis det eksisterer og er en gyldig URL
            if (variant.image && variant.image.startsWith('http')) {
              variantImage = variant.image;
            }
            // 2. Prøv å matche farge med bilder basert på indeks
            else if (variant.attributes?.color && allImages.length > 0) {
              const colorName = variant.attributes.color.toLowerCase();
              // Prøv å finne et bilde som kan matche fargen (bruk indeks som fallback)
              const colorIndex = index < allImages.length ? index : index % allImages.length;
              variantImage = allImages[colorIndex] || allImages[0] || null;
            }
            // 3. Bruk bilder fra allImages basert på variant indeks
            else if (allImages.length > 0) {
              // Del bildene mellom varianter
              const imageIndex = index < allImages.length ? index : index % allImages.length;
              variantImage = allImages[imageIndex] || allImages[0] || null;
            }

            return {
              name: variant.name || `Variant ${index + 1}`,
              price: sellingPrice,
              compareAtPrice: compareAtPrice > sellingPrice ? compareAtPrice : null,
              supplierPrice: supplierPrice,
              image: variantImage,
              attributes: variant.attributes || {},
              stock: variant.stock || 10,
              isActive: true,
            };
          });
        } 
        
        // Hvis ingen varianter funnet fra scraping, prøv å generere basert på produktnavn/URL
        if (variantsToCreate.length === 0) {
          console.log('   🔍 Ingen varianter funnet via scraping, prøver å generere basert på produktnavn/URL...');
          
          const urlLower = supplierUrl.toLowerCase();
          const productNameLower = cleanedTitle.toLowerCase();
          const categoryLower = (product.category || "").toLowerCase();
          
          // Sjekk for lengdevarianter (kabler, ladere)
          const isCable = productNameLower.includes("kabel") || productNameLower.includes("cable") ||
                         productNameLower.includes("lader") || productNameLower.includes("charger") ||
                         urlLower.includes("ft") || urlLower.includes("meter") || urlLower.includes("m-");
          
          // Sjekk for fargevarianter
          const hasColorOptions = urlLower.includes("color") || urlLower.includes("farge") || 
                                 urlLower.includes("3-color") || urlLower.includes("farger") ||
                                 urlLower.includes("-color-options");
          
          // Vanlige farger
          const colors = ["Svart", "Hvit", "Grå", "Rød", "Blå", "Grønn"];
          
          if (isCable) {
            // For kabler: legg til lengdevarianter
            const lengthMatches = urlLower.match(/(\d+(?:\.\d+)?)\s*(?:ft|fot|m|meter)/gi) || 
                                 productNameLower.match(/(\d+(?:\.\d+)?)\s*(?:ft|fot|m|meter)/gi) || [];
            
            let lengths: string[] = [];
            if (lengthMatches.length > 0) {
              // Fjern duplikater og normaliser
              const uniqueLengths = Array.from(new Set(lengthMatches.map(m => m.trim().toLowerCase())));
              lengths = uniqueLengths.slice(0, 5).map(m => {
                // Konverter til meter hvis nødvendig
                if (m.includes('ft') || m.includes('fot')) {
                  const num = parseFloat(m.match(/\d+(?:\.\d+)?/)?.[0] || '1');
                  return `${(num * 0.3048).toFixed(1)}m`;
                }
                return m.replace(/\s*(ft|fot|meter|m)\s*/gi, 'm').trim();
              });
            } else {
              // Standard lengdevarianter basert på produkttype
              if (productNameLower.includes('lader') || productNameLower.includes('charger')) {
                lengths = ["1m", "2m"];
              } else if (productNameLower.includes('kabel') || productNameLower.includes('cable')) {
                lengths = ["1m", "2m", "3m"];
              }
            }
            
            if (lengths.length > 0) {
              lengths.forEach((length, index) => {
                const baseSupplierPrice = Number(product.supplierPrice || 0);
                const variantSupplierPrice = baseSupplierPrice + (index * 5); // Litt høyere pris for lengre kabler
                const profitMargin = baseSupplierPrice > 0
                  ? (Number(product.price) - baseSupplierPrice) / baseSupplierPrice
                  : 1.0;
                
                variantsToCreate.push({
                  name: `Lengde: ${length}`,
                  price: Math.round(variantSupplierPrice * (1 + profitMargin)),
                  compareAtPrice: product.compareAtPrice,
                  supplierPrice: variantSupplierPrice,
                  image: null,
                  attributes: { length },
                  stock: 10,
                  isActive: true,
                });
              });
              console.log(`   ✅ Genererte ${lengths.length} lengdevarianter`);
            }
          } 
          
          // Sjekk for fargevarianter (alle produkter kan ha farger)
          if (hasColorOptions || 
              productNameLower.includes("case") || productNameLower.includes("cover") ||
              productNameLower.includes("veske") || productNameLower.includes("bag") ||
              productNameLower.includes("tastatur") || productNameLower.includes("keyboard") ||
              productNameLower.includes("mus") || productNameLower.includes("mouse") ||
              productNameLower.includes("musesett") || productNameLower.includes("keyboard set")) {
            
            // For produkter med fargevarianter: legg til 3-5 vanlige farger
            const relevantColors = colors.slice(0, hasColorOptions ? 5 : 3);
            relevantColors.forEach((color) => {
              const variantSupplierPrice = Number(product.supplierPrice || 0);
              const profitMargin = variantSupplierPrice > 0
                ? (Number(product.price) - variantSupplierPrice) / variantSupplierPrice
                : 1.0;
              
              // Prøv å finne et passende bilde for denne fargen
              let variantImage: string | null = null;
              const productImages = typeof product.images === 'string' 
                ? JSON.parse(product.images) 
                : (Array.isArray(product.images) ? product.images : []);
              
              if (productImages.length > 0) {
                // Bruk første bildet som fallback, eller prøv å finne et bilde som passer fargen
                const colorIndex = relevantColors.indexOf(color);
                variantImage = productImages[colorIndex < productImages.length ? colorIndex : 0] || productImages[0] || null;
              }

              variantsToCreate.push({
                name: color,
                price: Number(product.price), // Samme pris for alle farger
                compareAtPrice: product.compareAtPrice,
                supplierPrice: variantSupplierPrice,
                image: variantImage,
                attributes: { color },
                stock: 10,
                isActive: true,
              });
            });
            console.log(`   ✅ Genererte ${relevantColors.length} fargevarianter`);
          }
        }

        // Oppdater produkt
        const updateData: any = {};
        const updates: string[] = [];

        if (shouldUpdateName) {
          updateData.name = cleanedTitle;
          updates.push('navn');
        }

        if (shouldUpdateDescription) {
          updateData.description = data.description;
          updates.push('beskrivelse');
        }

        if (shouldUpdatePrice) {
          // Oppdater pris, men behold profittmargin
          const profitMargin = product.supplierPrice && product.supplierPrice > 0
            ? (Number(product.price) - Number(product.supplierPrice)) / Number(product.supplierPrice)
            : 1.0;
          
          const newSupplierPrice = temuPriceNOK!;
          const newSellingPrice = Math.round(newSupplierPrice * (1 + profitMargin));
          
          updateData.price = newSellingPrice;
          updateData.supplierPrice = newSupplierPrice;
          if (product.compareAtPrice) {
            updateData.compareAtPrice = Math.round(newSellingPrice * (Number(product.compareAtPrice) / Number(product.price)));
          }
          updates.push('pris');
        }

        // Oppdater produkt hvis det er noen endringer
        if (Object.keys(updateData).length > 0) {
          await prisma.product.update({
            where: { id: product.id },
            data: updateData,
          });
          console.log(`   ✏️  Oppdatert: ${updates.join(', ')}`);
        }

        // Oppdater varianter
        if (variantsToCreate.length > 0) {
          // Slett eksisterende varianter
          await prisma.productVariant.deleteMany({
            where: { productId: product.id },
          });

          // Opprett nye varianter
          await prisma.productVariant.createMany({
            data: variantsToCreate.map(v => ({
              ...v,
              productId: product.id,
            })),
          });

          console.log(`   ✅ Lagt til ${variantsToCreate.length} varianter`);
          results.totalVariants += variantsToCreate.length;
        } else {
          console.log(`   ℹ️  Ingen varianter funnet eller generert`);
        }

        results.updated++;

        // Vent litt mellom hver request for å unngå rate limiting
        if (i < products.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000)); // 3 sekunder mellom hver
        }

      } catch (error) {
        console.error(`   ❌ Feil: ${error instanceof Error ? error.message : 'Ukjent feil'}`);
        results.errors++;
      }
    }

    // Sammendrag
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 SAMMENDRAG:');
    console.log(`   ✅ Oppdatert: ${results.updated} produkter`);
    console.log(`   ⚠️  Hoppet over: ${results.skipped} produkter`);
    console.log(`   ❌ Feil: ${results.errors} produkter`);
    console.log(`   🔢 Totalt antall varianter lagt til: ${results.totalVariants}`);

  } catch (error) {
    console.error('❌ Feil ved oppdatering:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Kjør scriptet
updateAllProducts()
  .then(() => {
    console.log('\n✅ Ferdig!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Feil:', error);
    process.exit(1);
  });

