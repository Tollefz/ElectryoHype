import "dotenv/config";
import { prisma } from "../lib/prisma";
import { getScraperForUrl } from "../lib/scrapers/server";
// Generate unique ID helper
function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(2, 6);
}

/**
 * Script for å importere flere Temu-produkter fra URL-lister
 * 
 * Bruk:
 * npm run import:temu
 * 
 * Eller rediger denne filen og legg til URL-er i TEMU_URLS arrayet nederst
 */

// USD til NOK konvertering (kan oppdateres med ekte rate)
const USD_TO_NOK_RATE = 10.5;
const PROFIT_MARGIN = 2; // 100% margin (2x supplier price)
const COMPARE_AT_PRICE_MULTIPLIER = 1.5; // 50% høyere enn salgspris

interface ImportResult {
  success: boolean;
  url: string;
  productName?: string;
  error?: string;
}

async function importTemuProduct(url: string): Promise<ImportResult> {
  try {
    console.log(`\n🔍 Scraper produkt fra: ${url}`);

    // Identifiser og hent scraper
    const scraper = getScraperForUrl(url);
    if (!scraper) {
      return {
        success: false,
        url,
        error: "Kunne ikke identifisere scraper for URL",
      };
    }
    const result = await scraper.scrapeProduct(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        url,
        error: result.error || "Ukjent feil ved scraping",
      };
    }

    const data = result.data;
    console.log(`✅ Scrapet produkt: ${data.title}`);

    // Først beregn base price
    // Base price (laveste variant pris eller hovedpris)
    let basePrice = data.variants && data.variants.length > 0
      ? Math.min(...data.variants.map(v => v.price))
      : data.price.amount;

    // If price is 0 or missing, estimate from product type
    if (!basePrice || basePrice === 0) {
      const urlLowerForPrice = url.toLowerCase();
      const titleLower = data.title.toLowerCase();
      
      let estimatedPrice = 9.99; // Default
      
      // Estimate based on product keywords
      if (urlLowerForPrice.includes("charger") || urlLowerForPrice.includes("lader") || titleLower.includes("charger") || titleLower.includes("lader")) {
        estimatedPrice = (urlLowerForPrice.includes("wireless") || urlLowerForPrice.includes("trådløs") || titleLower.includes("wireless")) ? 12.99 : 8.99;
      } else if (urlLowerForPrice.includes("cable") || urlLowerForPrice.includes("kabel") || titleLower.includes("cable") || titleLower.includes("kabel")) {
        estimatedPrice = 6.99;
      } else if (urlLowerForPrice.includes("keyboard") || urlLowerForPrice.includes("tastatur") || titleLower.includes("keyboard") || titleLower.includes("tastatur")) {
        estimatedPrice = (urlLowerForPrice.includes("mechanical") || urlLowerForPrice.includes("mekanisk") || titleLower.includes("mechanical")) ? 25.99 : 15.99;
      } else if (urlLowerForPrice.includes("mouse") || urlLowerForPrice.includes("mus") || titleLower.includes("mouse") || titleLower.includes("mus")) {
        estimatedPrice = 8.99;
      } else if (urlLowerForPrice.includes("bag") || urlLowerForPrice.includes("veske") || titleLower.includes("bag") || titleLower.includes("veske")) {
        estimatedPrice = 19.99;
      } else if (urlLowerForPrice.includes("hdmi") || urlLowerForPrice.includes("hdtv") || titleLower.includes("hdmi")) {
        estimatedPrice = 7.99;
      } else if (urlLowerForPrice.includes("charging") || urlLowerForPrice.includes("station") || titleLower.includes("charging")) {
        estimatedPrice = 14.99;
      }
      
      basePrice = estimatedPrice;
      console.log(`⚠️ No price found, using estimated $${estimatedPrice.toFixed(2)} USD based on product type`);
    }

    // Nå kan vi håndtere varianter - check both scraped data and URL
    let hasVariants = data.variants && data.variants.length > 1;
    let variants = data.variants || [];
    
    // Check URL for variant hints (e.g., "3-color-options", "3-3ft-6-6ft-9-9ft")
    const urlLowerForVariants = url.toLowerCase();
    
    // Color variants
    const colorMatch = urlLowerForVariants.match(/(\d+)[-\s]*color[-\s]?options?/i) || urlLowerForVariants.match(/(rød|blå|grønn|svart|hvit|gul|red|blue|green|black|white|yellow)[-\s]og[-\s](rød|blå|grønn|svart|hvit|gul|red|blue|green|black|white|yellow)/i);
    if (colorMatch && !hasVariants) {
      const numColors = colorMatch[1] ? parseInt(colorMatch[1]) : 2;
      const colorOptions = ["Svart", "Hvit", "Grå", "Rød", "Blå"].slice(0, Math.min(numColors, 5));
      variants = colorOptions.map((color) => ({
        name: color,
        price: basePrice, // Now basePrice is defined
        attributes: { color },
      }));
      hasVariants = variants.length > 1;
      if (hasVariants) {
        console.log(`🎨 Detected ${variants.length} color variants from URL`);
      }
    }
    
    // Length/size variants (e.g., "3-3ft-6-6ft-9-9ft" or "1m-5m")
    if (!hasVariants) {
      const lengthMatches = urlLowerForVariants.matchAll(/(\d+(?:\.\d+)?)\s*(?:ft|fot|m|meter|cm)/gi);
      const lengths = Array.from(lengthMatches).map(m => m[0]).filter((v, i, a) => a.indexOf(v) === i);
      if (lengths.length > 1) {
        variants = lengths.map((length) => ({
          name: `Lengde: ${length}`,
          price: basePrice, // Now basePrice is defined
          attributes: { length: length.trim() },
        }));
        hasVariants = variants.length > 1;
        if (hasVariants) {
          console.log(`📏 Detected ${variants.length} length variants from URL: ${lengths.join(", ")}`);
        }
      }
    }
    
    // Update basePrice if variants were found (use minimum variant price)
    if (hasVariants && variants.length > 0) {
      basePrice = Math.min(...variants.map(v => v.price));
    }

    // Konverter pris til NOK
    const baseSupplierPriceNok = Math.round(basePrice * USD_TO_NOK_RATE);
    const baseSellingPriceNok = Math.round(baseSupplierPriceNok * PROFIT_MARGIN);
    const baseCompareAtPriceNok = Math.round(baseSellingPriceNok * COMPARE_AT_PRICE_MULTIPLIER);

    // Generer unik SKU
    const sku = `TEMU-${generateId().toUpperCase()}`;

    // Generer slug fra tittel
    const slug = data.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Forbered data (må være før existing check)
    let images = data.images || [];
    
    // ALWAYS check URL parameters for images (more reliable than scraping)
    try {
      const urlParams = new URL(url).searchParams;
      const topGalleryUrl = urlParams.get('top_gallery_url');
      if (topGalleryUrl) {
        const decodedImage = decodeURIComponent(topGalleryUrl);
        // Add URL image at the beginning if not already in list
        if (!images.includes(decodedImage)) {
          images = [decodedImage, ...images];
          console.log("✅ Found main image from URL parameter");
        }
      }
    } catch (e) {
      console.warn("⚠️ Could not parse URL for images:", e);
    }
    
    // If still no images, use placeholder
    if (images.length === 0) {
      images = ["https://via.placeholder.com/600x600?text=Product+Image"];
      console.log("⚠️ No images found, using placeholder");
    } else {
      console.log(`✅ Total ${images.length} image(s) available`);
    }
    // Improve description if missing or too short
    let description = data.description || "";
    if (!description || description.length < 50) {
      // Generate description from title and specs
      const title = data.title;
      const specs = data.specs || {};
      const specKeys = Object.keys(specs);
      
      description = `
        <h2>${title}</h2>
        <p>Høy kvalitet produkt med moderne design og funksjoner. Perfekt til daglig bruk.</p>
        ${specKeys.length > 0 ? `
          <h3>Spesifikasjoner:</h3>
          <ul>
            ${specKeys.slice(0, 5).map(key => `<li><strong>${key}:</strong> ${specs[key]}</li>`).join("")}
          </ul>
        ` : ""}
        <h3>Hovedfunksjoner:</h3>
        <ul>
          <li>Moderne design</li>
          <li>Høy kvalitet</li>
          <li>Lett å bruke</li>
          <li>Pålitelig ytelse</li>
        </ul>
        <p>Bestill nå og få rask levering!</p>
      `.trim();
      console.log("✅ Generated description from product data");
    }
    const shortDescription = description.substring(0, 150) + (description.length > 150 ? "..." : "");

    // Bestem kategori (forsøk å gjette fra tittel og URL)
    let category = "Elektronikk";
    const titleLower = data.title.toLowerCase();
    const urlLower = url.toLowerCase();
    
    if (titleLower.includes("phone") || titleLower.includes("iphone") || titleLower.includes("mobil") || 
        urlLower.includes("iphone") || urlLower.includes("charger") || urlLower.includes("lader") || 
        urlLower.includes("cable") || urlLower.includes("kabel")) {
      category = "Mobil & Tilbehør";
    } else if (titleLower.includes("computer") || titleLower.includes("laptop") || titleLower.includes("pc") ||
               titleLower.includes("keyboard") || titleLower.includes("tastatur") || titleLower.includes("mouse") ||
               titleLower.includes("mus") || urlLower.includes("keyboard") || urlLower.includes("mouse") ||
               urlLower.includes("tastatur") || urlLower.includes("mus")) {
      category = "Datamaskiner";
    } else if (titleLower.includes("tv") || titleLower.includes("speaker") || titleLower.includes("høyttaler") ||
               titleLower.includes("hdmi") || titleLower.includes("hdtv") || urlLower.includes("hdmi") ||
               urlLower.includes("hdtv")) {
      category = "TV & Lyd";
    } else if (titleLower.includes("game") || titleLower.includes("gaming") || titleLower.includes("spill") ||
               urlLower.includes("gaming")) {
      category = "Gaming";
    } else if (titleLower.includes("home") || titleLower.includes("hjem") || titleLower.includes("bag") ||
               titleLower.includes("veske") || urlLower.includes("bag")) {
      category = "Hjem & Fritid";
    }

    // Clean product name (decode URL-encoded characters)
    const { cleanProductName } = await import('../lib/utils/url-decode');
    const cleanedTitle = cleanProductName(data.title);

    // Sjekk om produktet allerede eksisterer
    const existing = await prisma.product.findFirst({
      where: {
        OR: [
          { slug },
          { supplierUrl: url },
        ],
      },
    });

    if (existing) {
      console.log(`⚠️  Produktet eksisterer allerede: ${existing.name}`);
      console.log(`🔄 Oppdaterer eksisterende produkt...`);
      
      // Slett eksisterende varianter hvis de finnes
      if (hasVariants) {
        await prisma.productVariant.deleteMany({
          where: { productId: existing.id },
        });
      }
      
      // Oppdater produktet med nye data
      const updatedProduct = await prisma.product.update({
        where: { id: existing.id },
        data: {
          name: cleanedTitle,
          description: description || shortDescription,
          shortDescription,
          price: baseSellingPriceNok,
          compareAtPrice: baseCompareAtPriceNok,
          supplierPrice: baseSupplierPriceNok,
          images: JSON.stringify(images),
          tags: data.specs ? JSON.stringify(Object.keys(data.specs).slice(0, 10)) : JSON.stringify([]),
          category,
          isActive: true,
          variants: hasVariants ? {
            create: variants.map((variant, index) => {
              const variantSupplierPriceNok = Math.round(variant.price * USD_TO_NOK_RATE);
              const variantSellingPriceNok = Math.round(variantSupplierPriceNok * PROFIT_MARGIN);
              const variantCompareAtPriceNok = variant.compareAtPrice 
                ? Math.round(variant.compareAtPrice * USD_TO_NOK_RATE * PROFIT_MARGIN)
                : Math.round(variantSellingPriceNok * COMPARE_AT_PRICE_MULTIPLIER);
              
              return {
                name: variant.name,
                sku: `${existing.sku || sku}-V${index + 1}`,
                price: variantSellingPriceNok,
                compareAtPrice: variantCompareAtPriceNok,
                supplierPrice: variantSupplierPriceNok,
                image: variant.image || null,
                attributes: variant.attributes || {},
                stock: variant.stock || 0,
                isActive: true,
              };
            }),
          } : undefined,
        },
        include: {
          variants: true,
        },
      });

      console.log(`✅ Produktet er oppdatert: ${updatedProduct.name} (${updatedProduct.sku})`);
      console.log(`   Base pris: ${baseSupplierPriceNok} kr (leverandør) → ${baseSellingPriceNok} kr (salg)`);
      console.log(`   Bilder: ${images.length}`);
      if (hasVariants && 'variants' in updatedProduct && updatedProduct.variants) {
        const variantList = updatedProduct.variants as Array<{ name: string; supplierPrice: number | null; price: number }>;
        console.log(`   Varianter: ${variantList.length}`);
        variantList.forEach((variant) => {
          const supplierPrice = variant.supplierPrice || 0;
          console.log(`     • ${variant.name}: ${supplierPrice} kr → ${variant.price} kr`);
        });
      }

      return {
        success: true,
        url,
        productName: updatedProduct.name,
      };
    }

    // Opprett produkt med varianter
    const product = await prisma.product.create({
      data: {
        name: cleanedTitle,
        slug: `${slug}-${generateId().substring(0, 4)}`, // Legg til unik ID for å unngå konflikter
        description: description || shortDescription,
        shortDescription,
        price: baseSellingPriceNok, // Base price = laveste variant pris
        compareAtPrice: baseCompareAtPriceNok,
        supplierPrice: baseSupplierPriceNok,
        images: JSON.stringify(images),
        tags: data.specs ? JSON.stringify(Object.keys(data.specs).slice(0, 10)) : JSON.stringify([]),
        category,
        sku,
        isActive: true,
        supplierUrl: url,
        supplierName: "temu",
        variants: hasVariants ? {
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
        } : undefined,
      },
      include: {
        variants: true,
      },
    });

    console.log(`✅ Produktet er opprettet: ${product.name} (${product.sku})`);
    console.log(`   Base pris: ${baseSupplierPriceNok} kr (leverandør) → ${baseSellingPriceNok} kr (salg)`);
    console.log(`   Bilder: ${images.length}`);
    if (hasVariants && 'variants' in product && product.variants) {
      const variants = product.variants as Array<{ name: string; supplierPrice: number | null; price: number }>;
      console.log(`   Varianter: ${variants.length}`);
      variants.forEach((variant) => {
        const supplierPrice = variant.supplierPrice || 0;
        console.log(`     • ${variant.name}: ${supplierPrice} kr → ${variant.price} kr`);
      });
    }

    return {
      success: true,
      url,
      productName: product.name,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    console.error(`❌ Feil ved import av ${url}:`, message);
    return {
      success: false,
      url,
      error: message,
    };
  }
}

async function main() {
  console.log("🚀 Starter import av Temu-produkter...\n");

  // ============================================
  // TEMU URL-ER FRA BRUKER:
  // ============================================
  const TEMU_URLS: string[] = [
    "https://www.temu.com/no/2025-new-genuine-leather-crossbody-shoulder-bag-for-men-vintage-business-handbag-with-3-color-options-g-601102523744281.html?_oak_mp_inf=EJmAm7Ox1ogBGhZmbGFzaF9zYWxlX2xpc3RfbmY0MGU0IML33d%2BqMw%3D%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2F10bcb0c0-5952-4ce1-803f-db1b080211d3.jpg&spec_gallery_id=354843&refer_page_sn=10132&refer_source=0&freesia_scene=116&_oak_freesia_scene=116&_oak_rec_ext_1=MTY5MDA&refer_page_el_sn=201401&_x_channel_src=1&_x_channel_scene=spike&_x_sessn_id=n4o4rm4z89&refer_page_name=lightning-deals&refer_page_id=10132_1763821714907_p7fj6b0l4m",
    "https://www.temu.com/no/-usb-c-plug-hurtiglader-4-ports-multilader-med-2-usb-c-2-usb-a--flere-veggladearbeider-qc-3-0-pl-multiport-str%C3%B8madapter-for-iphone-17-16-15-14-13-12-11-pro-max-ipad-samsung-og-mobiltelefoner-g-601101636313907.html?_oak_name_id=3031185334341153293&_oak_mp_inf=ELPGhoyu1ogBGiAzODYwZjNmMjQxNTg0ZjNhOWNkZTNhODY0ZmI5MmRhZSDskunfqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2Fd8d5abd4-db21-4d17-a527-eae1a1ddb1b0.jpg&spec_gallery_id=272739&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=ODcwMA&_oak_gallery_order=1455867715%2C410821237%2C327773106%2C1855909215%2C581236897&search_key=elektronikk%20tilbeh%C3%B8r&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763821889647_udnsh9429w&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/1pc-470-charger-pd-140w-usb-type-c-6-ports-desktop-fast-charging-station-with-eu-standard-plug-for-iphone-for-xiaomi-for-macbook-for-laptops-etc-1pc-100w-date-cable-travel-charger-multidevice-charging-portable-dock-sleek-charging-hub-g-601104193433667.html?_oak_name_id=5749078524442197036&_oak_mp_inf=EMPgsM%2B31ogBGiA4ODgzYmFkOWJiZDQ0YWU1YmE2Y2ZhOWViNTAwYmIwZCDdoPHfqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2F7296ad5c-5519-41cb-9f52-5dbcb392535e.jpg&spec_gallery_id=601104193433667&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=NDA4MDA&_oak_gallery_order=867583560%2C1675511506%2C693931729%2C730172632%2C67106664&search_key=elektronikk&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763821889647_udnsh9429w&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/-h%C3%B8y-kvalitet-sbt-2165h-1m--5m-hdtv-kabel-ultra-digitalt-lyd-og-video-2-1-moderne-tilkobling-slitesterkt-design-korrosjonsbestandig-kraftfull-kobberledning-displaykabel-alternativ-for-tv-teknologientusiaster-underholdningsutstyr-g-601100744160847.html?_oak_name_id=4825042788307226982&_oak_mp_inf=EM%2Fs0eKq1ogBGiA0NGRkNGY0ZmM3OTE0ZjhjYjgzOTVkYWI1ZDIxMGY0MSC2r43gqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2F54a74e5b-6e67-4b66-af24-33792120ffb7.jpg&spec_gallery_id=601100744160847&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=NTgwMA&_oak_gallery_order=1073085523%2C234182497%2C5523214%2C184761849%2C439064670&search_key=hdmi&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/-8k--hdtv-2-1-kabel-48-h%C3%B8yhastighets-r%C3%B8dt-kjernestykke-gullbelagt-kontakt-aluminiumshylster-fl%C3%B8rtet-kabel-g-601099531902938.html?_oak_name_id=9057604886491729632&_oak_mp_inf=ENq%2Fy6Cm1ogBGiA0NGRkNGY0ZmM3OTE0ZjhjYjgzOTVkYWI1ZDIxMGY0MSC6r43gqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffmket%2F54fa8175fe67f43a7c50877898e821f9.jpg&spec_gallery_id=1&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=MzUwMA&_oak_gallery_order=63754270%2C1877640342%2C301428973%2C2040619420%2C1271768117&search_key=hdmi&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/-usb-c-to-hdtv-cable-compatible-for-macbook-galaxy-s9-s25-iphone-15-16-17-ipad-pro--surface-10ft-4k-ultra-hd-high-speed-usb-3-1-type-c-to-hdtv-cord-with-thunderbolt-5-4-3-for-smartphones-tablets-monitors-projectors-g-601104447441391.html?_oak_mp_inf=EO%2BTwMi41ogBGiA0NGRkNGY0ZmM3OTE0ZjhjYjgzOTVkYWI1ZDIxMGY0MSC6r43gqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2Fa8d020c3-d89b-46cf-83e7-5df41c03880c.jpg&spec_gallery_id=26257990207&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=NTgwMA&_oak_gallery_order=1277014377%2C877829996%2C477031319%2C1276996354%2C2009678410&search_key=hdmi&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/-240w--charging-cable-pd3-1-high-speed-type-c-charger-cord-fits-for-all-usb-c-to-usb-c-port-devices-g-601102619850574.html?_oak_mp_inf=EM7uhOGx1ogBGiA2NjQwNTIyNzIyOWU0MjU0YWI2Zjg5NjNhOThkODI4MyCGz5%2FgqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2Fba382e93-fdb8-4541-b9ec-255bb5f8b2b5.jpg&spec_gallery_id=601102619850574&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=MjkwMA&_oak_gallery_order=1129320777%2C922459460%2C767257426%2C148397586%2C1272776059&search_key=usbc%20lader&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/fast-charging-type-c-charging-cable-3-3ft-6-6ft-9-9ft-braided-usb-c-to-usb-c-cable-suitable-for-samsung-xiaomi-redmi-oppo-oneplus-and-more-smartphones-type-c-fast-charging-cable-charger-fast-charging-phone--fast-charging-charger-cable-fast-charger-type-c-cable-type-c-cable-fast-charger-fast-charging-cable-c-type-phone-charger-cable-phone-charging-cable-type-c-charger-fast-charging-charger-type-c-fast-charging-c-to-c-type-cable-fast--charger-g-601101965846820.html?_oak_mp_inf=EKTSl6mv1ogBGiA2NjQwNTIyNzIyOWU0MjU0YWI2Zjg5NjNhOThkODI4MyCIz5%2FgqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2F8a25207a-e1c6-4e46-8ed0-28a08ba24256.jpg&spec_gallery_id=294456&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=MjgwMA&_oak_gallery_order=677799160%2C445534158%2C397307744%2C1263881591%2C556943885&search_key=usbc%20lader&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/original-pd-60w-hurtiglader-usb-c-til-c-type-kabel--for--for-iphone-15-16-17-pro-max-hurtiglading--for-samsung-s24-xiaomi-kabel--g-601100157791290.html?_oak_name_id=4806100622241578934&_oak_mp_inf=ELrYhMuo1ogBGiA2NjQwNTIyNzIyOWU0MjU0YWI2Zjg5NjNhOThkODI4MyCJz5%2FgqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2Ffc499f0a-04f5-4edd-9f65-e644143cf07d.jpg&spec_gallery_id=601100157791290&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=MTcwMA&_oak_gallery_order=1508266741%2C452455863%2C1192834379%2C458449864%2C1148362713&search_key=usbc%20lader&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/superlang-hurtigladekabel-usb-datasynkroniseringskabel-for-iphone-14-13-12-11-pro-max-se-x-8-7-6-laderkabel-for-ipad-g-601099518830175.html?_oak_name_id=1130864783197603133&_oak_mp_inf=EN%2FMrZqm1ogBGiBmY2UyY2E2MGNiMGI0NDY0OGUxZGFmMDY5YTVmOWY5MSC4pKbgqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2Fc0a40a7d-4baf-43cd-9e93-70f3a09e8173.jpg&spec_gallery_id=601099518830175&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=MjIwMA&_oak_gallery_order=526617716%2C1307124580%2C940046521%2C1844320076%2C2019653138&search_key=iphone%20ladekabel&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/-3-i-1-nylonflettet-usb-ladekabel-multilengde-3-3-fot-6-6-fot-9-9-fot-universal-hurtiglading-usb-til-lightning-type-c-micro-usb-kontaktledning-matt-rund-36v-hann-til-hann-dataoverf%C3%B8ring-kompatibel-10-20w-utgang-for-iphone-samsung-xiaomi-og-mer-g-601099618751962.html?_oak_mp_inf=ENqrgMqm1ogBGiBmY2UyY2E2MGNiMGI0NDY0OGUxZGFmMDY5YTVmOWY5MSC5pKbgqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2Ffbd90858-ebd2-406f-b24c-4d3daa8bb2e1.jpg&spec_gallery_id=601099618751962&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=MzUwMA&_oak_gallery_order=1103180140%2C1326292283%2C806981104%2C341081395%2C1681157103&search_key=iphone%20ladekabel&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/-20-30w-fast-charging-type-c-to-lightning-cable-for-iphone-14-13-12-11-pro-max-xs-max-xr-x-8-7-plus-6s-plus-for-ipad-for--durable-braided-cord-with-metal-shielding-6-5ft-white-charging-cable-for-phone--g-601102190375992.html?_oak_mp_inf=ELjon5Sw1ogBGiBmY2UyY2E2MGNiMGI0NDY0OGUxZGFmMDY5YTVmOWY5MSC2pKbgqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2Fd3d90b55-6f20-4642-98be-34d04dcecf64.jpg&spec_gallery_id=305766&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=MjcwMA&_oak_gallery_order=783289203%2C116834074%2C1824944013%2C586391770%2C1747034975&search_key=iphone%20ladekabel&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/wireless-charger-stand-15w-fast-charging-dock-phone-charger-adaptive-led-wireless-charging-station-for-iphone-16-15-14-13-12-11-9-8-xr-samsung-s25-24-23-22-s21-s10-s9-lg-v40-g8-pixel-8-7-6-etc-g-601102390732554.html?_oak_name_id=66530254425531634&_oak_mp_inf=EIrO5POw1ogBGiAyZWIwOGU0MDMyOWY0NWE2YWY5YTdiOGEwNDZiYTE0NSDguLLgqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2F7726b422-c5eb-4712-a94a-990aeac5fe51.jpg&spec_gallery_id=601102390732554&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=NjAwMA&_oak_gallery_order=572033392%2C125942357%2C1018240450%2C505552148%2C8602317&search_key=elektronikk&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/-tr%C3%A5dl%C3%B8s-spillmus-ultra-lav----pc--kompatibel-h%C3%A5ndholdt-optisk-bevegelsesdeteksjon-behagelig-punkstil-design--offisielt-produkt--imaging--g-601099896391113.html?_oak_name_id=2602508534898723341&_oak_mp_inf=EMmLss6n1ogBGiA1ODY3MTI0NmZlODQ0NDg4YTAzMmU0MGJlZDY2ZjJlNSDcyrngqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2F68f3021f-7e38-4115-af8c-5ebab328bdb2.jpg&spec_gallery_id=53819&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=NjcwMA&_oak_gallery_order=627098625%2C844179850%2C1471478331%2C881814236%2C437730472&search_key=mus&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/2-4ghz-ergonomisk-tr%C3%A5dl%C3%B8s-spillmus-med-usb-mottaker-komfortabelt-design-str%C3%B8mlinjeformet-passform-r%C3%B8d-og-svart-alternativer--for-gaming-kontor-og-underholdning-portabel-datamus-ergonomisk-mus-sleik--glatt-overflate-g-601101562224534.html?_oak_mp_inf=EJa%2F3Oit1ogBGiA1ODY3MTI0NmZlODQ0NDg4YTAzMmU0MGJlZDY2ZjJlNSD4zbfgqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Fopen%2Fe2fc7e01b3f440a799d42d281aa7690b-goods.jpeg&spec_gallery_id=273593&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=NTIwMA&_oak_gallery_order=1296255069%2C1920157970%2C1569633970%2C1376415347%2C873660128&search_key=mus&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/rgb-spill-usb-lysende-atur-mini-60-datamaskinatur-shrink-61--stasjon%C3%A6r-datamaskin-b%C3%A6rbar-pc-g-601099517437326.html?_oak_name_id=4876376055219222473&_oak_mp_inf=EI7L2Jmm1ogBGiA1Nzg0YWQ5Mzg0YTc0YmNhOTBiNzZmYjE3ZmU1Y2I0MiDLjb7gqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2FFancyalgo%2FVirtualModelMatting%2Faa47a67895e749ea7237ee9296bdc032.jpg&spec_gallery_id=598&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=MTc5MDA&_oak_gallery_order=1829947991%2C205010189%2C578233281%2C130809279%2C1486639785&search_key=tastatur&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/s%C3%B8lvfarget-utsk%C3%A5ret-spilltastatur-med-usb-kabel-mekanisk-f%C3%B8lelse-og-bakgrunnsbelysning-for-skrivebord-b%C3%A6rbar-pc-og-kontorbruk-g-601099513599425.html?_oak_name_id=7564387866378385687&_oak_mp_inf=EMGr7pem1ogBGiA1Nzg0YWQ5Mzg0YTc0YmNhOTBiNzZmYjE3ZmU1Y2I0MiDNjb7gqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2Feccb4797-be95-4aec-9e78-a494fcce9319.jpg&spec_gallery_id=163&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=MTg3MDA&_oak_gallery_order=389626382%2C2039328979%2C1107328257%2C1083237077%2C387794682&search_key=tastatur&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/ultra--tr%C3%A5dl%C3%B8st-tastatur-og-musesett-b%C3%A6rbart-bt-tastatur-og-musekombo-egnet-for-ipad-nettbrett-b%C3%A6rbar-pc-kontordatatur-g-601099519046574.html?_oak_name_id=5150304079695819202&_oak_mp_inf=EK7nupqm1ogBGiA1Nzg0YWQ5Mzg0YTc0YmNhOTBiNzZmYjE3ZmU1Y2I0MiDNjb7gqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2FFancyalgo%2FVirtualModelMatting%2F9f5d95582dfdfac3f955a4e861a5716c.jpg&spec_gallery_id=601099519046574&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=MTUxMDA&_oak_gallery_order=2015245676%2C1035655086%2C754888036%2C2063980879%2C1759014648&search_key=tastatur&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/-68--mekanisk-spilltastatur-med-bl%C3%A5-brytere-kompatibelt-med-cherry-vietnam-kinesisk-rgb-bakgrunnsbelyst-mini-pc-b%C3%A6rbart-tastatur-avtakbar-type-c-kabel-tastaturkapseluttrekker-kablet-for-windows--bl%C3%A5-brytere-inkludert-g-601099600944889.html?_oak_name_id=2233207609145535461&_oak_mp_inf=EPm9wcGm1ogBGiA1Nzg0YWQ5Mzg0YTc0YmNhOTBiNzZmYjE3ZmU1Y2I0MiDOjb7gqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2Fbad1a222-4420-4a9b-923c-b13d8c4171de.jpg&spec_gallery_id=601099600944889&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=NDA3MDA&_oak_gallery_order=1696611666%2C939366374%2C1014711313%2C2071733690%2C690594414&search_key=tastatur&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
    "https://www.temu.com/no/for--wireless-keyboard-set-ultra-thin-keyboard-lightweight-mouse-2-4g-connection-dry-battery-powered-product-does-not--battery-portable-design-computer-tablet-multi-device-universal-keyboard-and-mouse-set--home-set-g-601102593657943.html?_oak_mp_inf=ENeYxtSx1ogBGiA1Nzg0YWQ5Mzg0YTc0YmNhOTBiNzZmYjE3ZmU1Y2I0MiDMjb7gqjM%3D&top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2F5835cc2a-9fae-4e85-822f-315184a31495.jpg&spec_gallery_id=601102593657943&refer_page_sn=10009&refer_source=0&freesia_scene=2&_oak_freesia_scene=2&_oak_rec_ext_1=MjQzMDA&_oak_gallery_order=1543151901%2C2058265321%2C421816734%2C751389969%2C1459431752&search_key=tastatur&refer_page_el_sn=200049&refer_page_name=search_result&refer_page_id=10009_1763822475906_93or9clux7&_x_sessn_id=n4o4rm4z89",
  ];

  if (TEMU_URLS.length === 0) {
    console.log("⚠️  Ingen URL-er funnet!");
    console.log("\n📝 Hvordan bruke:");
    console.log("1. Åpne scripts/import-temu-products.ts");
    console.log("2. Legg til Temu URL-er i TEMU_URLS arrayet");
    console.log("3. Kjør: npm run import:temu");
    process.exit(0);
  }

  console.log(`📦 Fant ${TEMU_URLS.length} produkt(er) å importere\n`);

  const results: ImportResult[] = [];

  for (const url of TEMU_URLS) {
    const result = await importTemuProduct(url);
    results.push(result);
    
    // Vent litt mellom hver import for å unngå rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Oppsummering
  console.log("\n" + "=".repeat(60));
  console.log("📊 IMPORTOPPSUMERING");
  console.log("=".repeat(60));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`✅ Vellykket: ${successful.length}`);
  console.log(`❌ Feilet: ${failed.length}`);
  console.log(`📦 Totalt: ${results.length}`);

  if (successful.length > 0) {
    console.log("\n✅ Vellykkede produkter:");
    successful.forEach((r) => {
      console.log(`   • ${r.productName}`);
    });
  }

  if (failed.length > 0) {
    console.log("\n❌ Feilede produkter:");
    failed.forEach((r) => {
      console.log(`   • ${r.url}`);
      if (r.error) {
        console.log(`     Feil: ${r.error}`);
      }
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

