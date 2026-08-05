// Note: Temu scraping is primarily axios + cheerio based.
// Puppeteer is only loaded lazily (dynamic import) as a fallback to collect
// the full image gallery, since Temu renders the gallery client-side behind
// an anti-bot challenge that plain HTTP requests cannot pass.
import axios from "axios";
import * as cheerio from "cheerio";
import { upgradeImageUrl } from "@/lib/import/image-quality";
import type { ScraperResult, ProductVariant, ScrapedProductData, Scraper } from "./types";
import { extractTemuPriceNOKFromUrl } from "./temu-price";

type JsonRecord = Record<string, unknown>;

/** Mirrors `a || b || c` semantics for unknown-typed values: first truthy value, else the last one. */
function orChain(...values: unknown[]): unknown {
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i]) return values[i];
  }
  return values[values.length - 1];
}

/** Coerces an unknown value to a string the same way implicit ToString coercion (e.g. parseFloat, `${x}`) would. */
function toStr(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Returns the value only if it's already a non-empty string, otherwise undefined. */
function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function firstArrayItem(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

export class TemuScraper implements Scraper<ScrapedProductData> {
  // Don't extend BaseScraper - this avoids loading Puppeteer entirely
  async scrapeProduct(url: string): Promise<ScraperResult> {
    try {
      console.log(`[TemuScraper] Starting scrape for: ${url.substring(0, 80)}...`);
      
      // First extract from URL (fast, reliable) - now async to support API calls
      const urlData = await this.extractFromUrl(url);
      console.log(`[TemuScraper] URL data extracted - images: ${urlData.images.length}, variants: ${urlData.variants?.length || 0}`);
      
      // Then try to fetch HTML and extract variants (without Puppeteer)
      let htmlData: { variants?: ProductVariant[]; images?: string[]; description?: string } = {};
      try {
        console.log(`[TemuScraper] Attempting to fetch HTML for variants...`);
        htmlData = await this.fetchHtmlAndExtractVariants(url);
        console.log(`[TemuScraper] HTML data extracted - variants: ${htmlData.variants?.length || 0}, images: ${htmlData.images?.length || 0}`);
      } catch (error) {
        console.warn("[TemuScraper] ⚠️ Could not fetch HTML for variants, using URL data only:", error instanceof Error ? error.message : String(error));
        console.error("[TemuScraper] Full error:", error);
      }
      
      // Combine URL data with HTML data
      // Prefer images from URL (guaranteed to work), then add any additional ones from HTML
      let allImages = [
        ...urlData.images,
        ...(htmlData.images || [])
      ].filter((img, index, self) => self.indexOf(img) === index); // Remove duplicates
      
      console.log(`[TemuScraper] Combined ${urlData.images.length} URL images + ${htmlData.images?.length || 0} HTML images = ${allImages.length} total`);

      // Temu renders the full gallery client-side behind an anti-bot challenge,
      // so URL/HTML extraction usually only yields the single top_gallery_url
      // image. When that happens, collect the full gallery with a headless
      // stealth browser before returning.
      if (allImages.length <= 1) {
        try {
          const galleryImages = await this.fetchGalleryWithBrowser(url);
          if (galleryImages.length >= 2) {
            // Gallery is authoritative: full set, original order, deduped,
            // best resolution. Keep any previously found image that is not
            // already in the gallery (by filename) at the end.
            const galleryFilenames = new Set(
              galleryImages.map((img) => img.split("/").pop() || img)
            );
            const extras = allImages
              .map((img) => upgradeImageUrl(img))
              .filter((img) => !galleryFilenames.has(img.split("/").pop() || img));
            allImages = [...galleryImages, ...extras];
            console.log(`[TemuScraper] ✅ Browser gallery collected ${galleryImages.length} images (${allImages.length} total)`);
          } else {
            console.log(`[TemuScraper] Browser gallery returned ${galleryImages.length} image(s), keeping URL/HTML images`);
          }
        } catch (error) {
          console.warn(`[TemuScraper] ⚠️ Browser gallery collection failed:`, error instanceof Error ? error.message : String(error));
        }
      }
      
      // Prioritize HTML variants, fall back to URL variants, or create default variant
      let variants = htmlData.variants && htmlData.variants.length > 0 
        ? htmlData.variants 
        : urlData.variants;
      
      // CRITICAL: If no variants found, create at least one default variant.
      // Price must stay in NOK — never invent 9.99 USD.
      if (!variants || variants.length === 0) {
        console.log(`[TemuScraper] ⚠️ No variants found, creating default variant`);
        variants = [{
          name: "Standard",
          price: urlData.price.amount > 0 ? urlData.price.amount : 0,
          attributes: {},
          image: allImages.length > 0 ? allImages[0] : undefined,
        }];
      }
      
      // Ensure all variants have required fields and valid structure
      // Assign images to variants - distribute across variants if we have multiple images
      if (variants && variants.length > 0) {
        variants = variants.map((v, index) => {
          let variantImage = v.image;
          
          // If variant doesn't have a valid image, assign from allImages
          if (!variantImage || !variantImage.startsWith('http')) {
            if (allImages.length > 0 && variants) {
              // Distribute images across variants
              if (allImages.length >= variants.length) {
                variantImage = allImages[index];
              } else {
                variantImage = allImages[index % allImages.length];
              }
            }
          }
          
          return {
            name: v.name || "Standard",
            price: typeof v.price === 'number' && v.price > 0 ? v.price : (urlData.price.amount > 0 ? urlData.price.amount : 0),
            attributes: v.attributes || {},
            image: variantImage,
            // Preserve supplier-provided fields when available
            sku: v.sku,
            stock: typeof v.stock === 'number' ? v.stock : undefined,
            supplierPrice: v.supplierPrice,
            compareAtPrice: v.compareAtPrice,
          };
        });
      }
      
      console.log(`[TemuScraper] Final result - variants: ${variants.length}, images: ${allImages.length}`);
      if (variants.length > 0) {
        console.log(`[TemuScraper] Variants:`, variants.map(v => `${v.name} (${v.price})`).join(', '));
      }
      
      // Build result - ensure variants are always included
      const result = {
        supplier: "temu" as const,
        url,
        images: allImages.length > 0 ? allImages : urlData.images,
        title: urlData.title || this.decodeTitleFromUrl(url) || "Temu Produkt",
        price:
          urlData.price.amount > 0
            ? urlData.price
            : { amount: 0, currency: "NOK" as const },
        description: htmlData.description || urlData.description || "",
        variants: variants,
        specs: {},
        availability: true,
      };
      
      // Double-check that variants are present
      if (!result.variants || result.variants.length === 0) {
        console.error(`[TemuScraper] ❌ ERROR: No variants in result, creating emergency default`);
        result.variants = [{
          name: "Standard",
          price: result.price.amount,
          attributes: {},
          image: result.images.length > 0 ? result.images[0] : undefined,
        }];
      }
      
      // Ensure title is valid
      if (!result.title || result.title === "Temu product") {
        result.title = this.decodeTitleFromUrl(url) || "Temu Produkt";
      }
      
      console.log(`[TemuScraper] ✅ Scraping complete - returning ${result.variants?.length || 0} variants`);
      return this.toResult(result);
    } catch (error) {
      // Even if everything fails, try to return URL-based data
      try {
        const urlData = await this.extractFromUrl(url);
        // Ensure at least one variant exists in fallback
        const fallbackVariants = urlData.variants && urlData.variants.length > 0 
          ? urlData.variants 
          : [{
              name: "Standard",
              price: urlData.price.amount > 0 ? urlData.price.amount : 0,
              attributes: {},
              image: urlData.images.length > 0 ? urlData.images[0] : undefined,
            }];
        
        return this.toResult({
          supplier: "temu",
          url,
          title: this.decodeTitleFromUrl(url) || "Temu Produkt",
          description: urlData.description || "",
          price:
            urlData.price.amount > 0
              ? urlData.price
              : { amount: 0, currency: "NOK" },
          images: urlData.images,
          variants: fallbackVariants,
          specs: {},
          availability: true,
        });
      } catch (fallbackError) {
        // Last resort: return structure without inventing a USD placeholder price
        return this.toResult({
          supplier: "temu",
          url,
          title: this.decodeTitleFromUrl(url) || "Temu Produkt",
          description: "",
          price: { amount: 0, currency: "NOK" },
          images: [],
          variants: [{
            name: "Standard",
            price: 0,
            attributes: {},
          }],
          specs: {},
          availability: true,
        });
      }
    }
  }

  /**
   * Collect the full product image gallery with a headless stealth browser.
   *
   * Temu only ships the gallery to real browsers: plain HTTP requests get an
   * obfuscated anti-bot challenge page with no product data, so URL/HTML
   * extraction can never see more than the single top_gallery_url image.
   *
   * Strategy:
   * - Load the bare product URL (tracking params trigger a login redirect).
   * - Accept the cookie banner when shown.
   * - Poll until gallery images render, then collect them from
   *   window.rawData and the DOM in original document order.
   * - Skip recommendation images (inside links to other products), icons
   *   and non-product CDN assets.
   * - Upgrade every URL to full resolution and dedupe, preserving order.
   *
   * Returns [] when Temu serves a CAPTCHA/login wall or Puppeteer is
   * unavailable – callers keep their existing single-image fallback.
   */
  private async fetchGalleryWithBrowser(url: string): Promise<string[]> {
    // Bare URL: query params (refer_page_*, _oak_*, ads ids) make Temu
    // redirect headless sessions straight to login.html
    const bareUrl = url.split("?")[0];
    const productIdMatch = bareUrl.match(/-g-(\d+)/);
    const productId = productIdMatch ? productIdMatch[1] : "";

    type PuppeteerExtraLike = {
      use: (plugin: unknown) => void;
      launch: (options: Record<string, unknown>) => Promise<{
        newPage: () => Promise<import("puppeteer").Page>;
        close: () => Promise<void>;
      }>;
    };
    let puppeteerExtra: PuppeteerExtraLike;
    try {
      const puppeteerExtraMod = await import("puppeteer-extra");
      const stealthMod = await import("puppeteer-extra-plugin-stealth");
      const extraMod = puppeteerExtraMod as unknown as { default?: PuppeteerExtraLike } & PuppeteerExtraLike;
      puppeteerExtra = extraMod.default ?? extraMod;
      const stealth = stealthMod as { default?: () => unknown } & (() => unknown);
      const StealthPlugin = stealth.default ?? stealth;
      puppeteerExtra.use(StealthPlugin());
    } catch (error) {
      console.warn("[TemuScraper] Puppeteer not available for gallery collection:", error instanceof Error ? error.message : String(error));
      return [];
    }

    console.log(`[TemuScraper] 🖼️ Collecting full gallery with headless browser...`);
    const browser = await puppeteerExtra.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1920,1080",
        "--lang=no,en-US,en",
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.goto(bareUrl, { waitUntil: "networkidle2", timeout: 45000 });

      // Snippets are passed as strings: bundlers inject helpers (__name etc.)
      // into serialized functions, which breaks page.evaluate.
      const acceptCookiesSnippet = `(() => {
        const btns = Array.from(document.querySelectorAll('div[role="button"], button'));
        const accept = btns.find(b => (b.innerText || '').trim() === 'Godta alle' || (b.innerText || '').trim() === 'Accept all');
        if (accept) { accept.click(); return true; }
        return false;
      })()`;

      const collectSnippet = `(() => {
        const txt = document.body ? document.body.innerText : '';
        const captcha = txt.includes('Sikkerhetsverifisering') || txt.includes('pusle') || txt.toLowerCase().includes('security verification');
        const login = location.href.includes('login.html');
        const images = [];
        const push = (u) => {
          if (typeof u === 'string' && u.indexOf('http') === 0 && u.indexOf('img.kwcdn.com') !== -1) images.push(u);
        };

        // Source 1: window.rawData gallery arrays (authoritative order)
        try {
          const seen = new Set();
          const visit = (obj, depth) => {
            if (!obj || typeof obj !== 'object' || depth > 8 || seen.has(obj)) return;
            seen.add(obj);
            if (Array.isArray(obj)) { for (const v of obj) visit(v, depth + 1); return; }
            for (const k in obj) {
              const v = obj[k];
              if (/gallery|carousel/i.test(k) && Array.isArray(v)) {
                for (const item of v) {
                  if (typeof item === 'string') push(item);
                  else if (item && typeof item === 'object') push(item.url || item.imgUrl || item.image);
                }
              }
              visit(v, depth + 1);
            }
          };
          visit(window.rawData && window.rawData.store, 0);
        } catch (e) {}

        // Source 2: DOM images in document order (fallback)
        if (images.length < 2) {
          const currentId = ${JSON.stringify(productId)};
          for (const img of document.querySelectorAll('img')) {
            const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
            if (!src || src.indexOf('img.kwcdn.com') === -1) continue;
            if (!/product|open|goods/.test(src)) continue;
            // Skip small icons/thumbnails that have rendered
            if (img.naturalWidth > 0 && img.naturalWidth < 200) continue;
            // Skip recommendation images: they sit inside links to other products
            const link = img.closest('a[href]');
            if (link) {
              const href = link.getAttribute('href') || '';
              if (/-g-\\d+/.test(href) && (!currentId || href.indexOf(currentId) === -1)) continue;
            }
            push(src);
          }
        }
        return JSON.stringify({ captcha, login, images });
      })()`;

      // Poll for the gallery: challenge/render timing varies
      const deadline = Date.now() + 18000;
      let lastState: { captcha: boolean; login: boolean; images: string[] } = { captcha: false, login: false, images: [] };
      let cookiesHandled = false;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2500));

        if (page.url().includes("login.html")) {
          console.log("[TemuScraper] Gallery collection blocked by login wall");
          return [];
        }
        if (!cookiesHandled) {
          cookiesHandled = Boolean(await page.evaluate(acceptCookiesSnippet));
        }

        lastState = JSON.parse(await page.evaluate<[], () => string>(collectSnippet));
        if (lastState.login) {
          console.log("[TemuScraper] Gallery collection blocked by login wall");
          return [];
        }
        if (lastState.captcha && lastState.images.length === 0) {
          console.log("[TemuScraper] Gallery collection blocked by CAPTCHA");
          return [];
        }
        if (lastState.images.length >= 2) break;
      }

      // Best resolution + dedupe, preserving original order
      const seen = new Set<string>();
      const gallery: string[] = [];
      for (const raw of lastState.images) {
        const upgraded = upgradeImageUrl(raw);
        if (!seen.has(upgraded)) {
          seen.add(upgraded);
          gallery.push(upgraded);
        }
      }
      return gallery;
    } finally {
      await browser.close();
    }
  }

  // Helper methods that would normally come from BaseScraper
  private toResult(data: ScrapedProductData, rawHtml?: string): ScraperResult {
    return { success: true, data, rawHtml };
  }

  private failure(error: unknown, rawHtml?: string): ScraperResult {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown scraper error",
      rawHtml,
    };
  }
  
  /**
   * Decode product title from URL path
   */
  private decodeTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p && p !== 'no');
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        // Remove file extension if present
        const titlePart = lastPart.replace(/\.html?$/, '');
        // Decode URL encoding
        let decoded = titlePart;
        try {
          decoded = decodeURIComponent(titlePart);
          // Check for double encoding
          if (decoded.includes('%')) {
            decoded = decodeURIComponent(decoded);
          }
        } catch {
          // If decoding fails, use original
        }
        
        // Replace URL-encoded Norwegian characters manually
        decoded = decoded
          .replace(/%C3%A5/g, 'å')
          .replace(/%C3%A6/g, 'æ')
          .replace(/%C3%B8/g, 'ø')
          .replace(/%C3%85/g, 'Å')
          .replace(/%C3%86/g, 'Æ')
          .replace(/%C3%98/g, 'Ø')
          .replace(/%20/g, ' ')
          .replace(/\+/g, ' ');
        
        // Extract title from path (before -g-)
        if (decoded.includes('-g-')) {
          decoded = decoded.split('-g-')[0];
        }
        
        // Format title (keep numbers: pack counts and model numbers are meaningful)
        const formatted = decoded
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
          .trim();
          
        if (formatted.length > 3) {
          return formatted;
        }
      }
    } catch {
      // Ignore errors
    }
    return "Temu Produkt";
  }

  /**
   * Extract product data from URL parameters (reliable fallback)
   * Also tries to fetch variant data from Temu API if product ID is available
   */
  private async extractFromUrl(url: string) {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    
    const title = this.extractTitleFromUrl(url);
    
    // Extract product ID from URL
    const pathParts = urlObj.pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1] || '';
    // Require the "-g-" delimiter: a bare /g-\d+/ also matches slug text like "awg-0"
    const productIdMatch = lastPart.match(/-g-(\d+)/);
    const productId = productIdMatch ? productIdMatch[1] : null;
    
    // Extract main image from URL parameter
    const topGalleryUrl = params.get("top_gallery_url");
    const specGalleryId = params.get("spec_gallery_id");
    const images: string[] = [];
    
    if (topGalleryUrl) {
      try {
        const decodedUrl = decodeURIComponent(topGalleryUrl);
        if (decodedUrl.startsWith('http')) {
          images.push(decodedUrl);
          console.log(`[TemuScraper] Found image from top_gallery_url: ${decodedUrl.substring(0, 80)}...`);
          
          // If we have spec_gallery_id, we might be able to generate more variant images
          // Temu often uses gallery IDs to reference variant images
          if (specGalleryId && productId) {
            console.log(`[TemuScraper] Found spec_gallery_id: ${specGalleryId}, might indicate variant-specific images`);
          }
        }
      } catch {
        // If decoding fails, try to use as-is
        if (topGalleryUrl.startsWith('http')) {
          images.push(topGalleryUrl);
        }
      }
    }
    
    // If no image from URL parameter, try to generate from product ID
    // Temu product images often follow patterns like:
    // https://img.kwcdn.com/product/[type]/[hash].jpg
    // or https://img.kwcdn.com/product/original/[productId].jpg
    if (images.length === 0 && productId) {
      console.log(`[TemuScraper] No image from URL, trying to generate from product ID: ${productId}`);
      
      // Try common Temu image URL patterns
      const possibleImageUrls = [
        `https://img.kwcdn.com/product/fancy/${productId}.jpg`,
        `https://img.kwcdn.com/product/original/${productId}.jpg`,
        `https://img.kwcdn.com/product/${productId}.jpg`,
        `https://img.kwcdn.com/product/thumbnail/${productId}.jpg`,
      ];
      
      // We'll try the first pattern - it's the most common
      // The actual image might not exist, but it's better than nothing
      images.push(possibleImageUrls[0]);
      console.log(`[TemuScraper] Generated image URL from product ID: ${possibleImageUrls[0]}`);
    }
    
    // Store base images - we'll combine with HTML-scraped images later
    // These are real, working images from the URL
    const baseImages = [...images];
    console.log(`[TemuScraper] Found ${baseImages.length} base image(s) from URL`);
    
    // Images array will be used directly - it will be combined with HTML images later
    
    // Extract real Temu page price in NOK. Never invent 9.99 USD.
    const extracted = extractTemuPriceNOKFromUrl(url);
    const price =
      extracted.amountNOK > 0
        ? { amount: extracted.amountNOK, currency: "NOK" as const }
        : { amount: 0, currency: "NOK" as const };
    if (extracted.amountNOK > 0) {
      console.log(
        `[TemuScraper] Price from ${extracted.source}: ${extracted.amountNOK} NOK`
      );
    } else {
      console.warn(
        `[TemuScraper] ⚠️ Could not extract Temu page price from URL — leaving amount 0 NOK (no USD placeholder)`
      );
    }
    
    // Extract variants - try API first, then fallback to URL parsing
    let variants: Array<{
      name: string;
      price: number;
      attributes: Record<string, string>;
      image?: string;
      sku?: string;
      stock?: number;
      supplierPrice?: number;
      compareAtPrice?: number;
    }> = [];
    
    // Try to fetch variant data from Temu API if we have product ID
    if (productId) {
      try {
        console.log(`[TemuScraper] Attempting to fetch variant data from API for product ID: ${productId}`);
        const apiVariants = await this.fetchVariantsFromApi(productId);
        if (apiVariants && apiVariants.length > 0) {
          console.log(`[TemuScraper] ✅ Found ${apiVariants.length} variants from API`);
          variants = apiVariants;
        }
      } catch (error) {
        console.warn(`[TemuScraper] ⚠️ Could not fetch variants from API:`, error instanceof Error ? error.message : String(error));
      }
    }
    
    // If no variants from API, try to extract from URL or title
    if (variants.length === 0) {
      // Common color variants that Temu products often have
      // We'll try to detect these from the product title or URL
      const colorKeywords: Record<string, string> = {
        'svart': 'Svart',
        'black': 'Svart',
        'hvit': 'Hvit',
        'white': 'Hvit',
        'rød': 'Rød',
        'red': 'Rød',
        'grå': 'Grå',
        'grey': 'Grå',
        'gray': 'Grå',
        'blå': 'Blå',
        'blue': 'Blå',
        'grønn': 'Grønn',
        'green': 'Grønn',
        'gul': 'Gul',
        'yellow': 'Gul',
        'rosa': 'Rosa',
        'pink': 'Rosa',
        'lilla': 'Lilla',
        'purple': 'Lilla',
        'oransje': 'Oransje',
        'orange': 'Oransje',
        'brun': 'Brun',
        'brown': 'Brun',
      };
      
      const urlLower = url.toLowerCase();
      const titleLower = title.toLowerCase();
      const allText = `${urlLower} ${titleLower}`;
      
      // Check if product mentions multiple colors or variants
      const foundColors: string[] = [];
      for (const [key, value] of Object.entries(colorKeywords)) {
        if (allText.includes(key)) {
          if (!foundColors.includes(value)) {
            foundColors.push(value);
          }
        }
      }
      
      // Create one variant per detected color – no color filtering.
      // Variants are imported exactly as the supplier text indicates.
      if (foundColors.length > 0) {
        console.log(`[TemuScraper] Detected colors from text: ${foundColors.join(', ')}`);

        for (const color of foundColors) {
          // Try to find an image that matches the color keyword
          let variantImage: string | undefined = undefined;
          if (images.length > 0) {
            const colorLower = color.toLowerCase();
            const englishKeys = Object.entries(colorKeywords)
              .filter(([, value]) => value === color)
              .map(([key]) => key);
            const matchingImage = images.find(img => {
              const imgLower = img.toLowerCase();
              return englishKeys.some(keyword => imgLower.includes(keyword)) || imgLower.includes(colorLower);
            });
            variantImage = matchingImage || images[0];
          }

          variants.push({
            name: color,
            price: price.amount,
            attributes: { color: color, farge: color },
            image: variantImage,
          });

          console.log(`[TemuScraper] Created variant "${color}" with image: ${variantImage ? variantImage.substring(0, 60) + '...' : 'none'}`);
        }
      } else {
        // No colors detected in URL/title – create a single neutral variant
        // without inventing a color the supplier never specified
        variants.push({
          name: "Standard",
          price: price.amount,
          attributes: {},
          image: images.length > 0 ? images[0] : undefined,
        });
        console.log(`[TemuScraper] No colors detected, created default variant "Standard"`);
      }
    }
    
    return {
      title: title || "Temu Produkt",
      images: images.length > 0 ? images : [],
      price,
      description: "",
      variants: variants.length > 0 ? variants : undefined,
    };
  }
  
  /**
   * Try to fetch variant data from Temu API
   * Also tries alternative endpoints and methods to get variant images
   */
  private async fetchVariantsFromApi(productId: string): Promise<Array<{
    name: string;
    price: number;
    attributes: Record<string, string>;
    image?: string;
    sku?: string;
    stock?: number;
  }> | null> {
    try {
      // Try different API endpoints that Temu might use
      const apiEndpoints = [
        `https://www.temu.com/api/product/detail?goods_id=${productId}`,
        `https://www.temu.com/no/api/goods/detail?goodsId=${productId}`,
        `https://api.temu.com/product/${productId}`,
        `https://www.temu.com/api/goods/detail?goodsId=${productId}&scene=detail`,
        `https://www.temu.com/api/goods/getGoodsDetail?goodsId=${productId}`,
      ];
      
      for (const endpoint of apiEndpoints) {
        try {
          console.log(`[TemuScraper] Trying API endpoint: ${endpoint}`);
          const response = await axios.get(endpoint, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'no,en-US;q=0.9,en;q=0.8',
              'Referer': 'https://www.temu.com/',
              'Origin': 'https://www.temu.com',
            },
            timeout: 15000,
            validateStatus: (status) => status < 500,
          });
          
          if (response.status === 200 && response.data) {
            const data = response.data;
            console.log(`[TemuScraper] API response keys:`, Object.keys(data).join(', '));
            
            // Try different response structures
            // Structure 1: Direct skuList
            let skuList = data.goodsSkuList || data.skuList || data.variants || data.skus;
            
            // Structure 2: Nested in data/result
            if (!skuList && data.data) {
              skuList = data.data.goodsSkuList || data.data.skuList || data.data.variants || data.data.skus;
            }
            
            // Structure 3: In result field
            if (!skuList && data.result) {
              skuList = data.result.goodsSkuList || data.result.skuList || data.result.variants || data.result.skus;
            }
            
            // Structure 4: Check if entire response is an array
            if (!skuList && Array.isArray(data)) {
              skuList = data;
            }
            
            if (skuList && Array.isArray(skuList) && skuList.length > 0) {
              console.log(`[TemuScraper] ✅ Found ${skuList.length} SKUs from API`);
              
              const variants = skuList.map((sku: JsonRecord) => {
                // Extract variant name from specList
                let variantName = 'Standard';
                const attributes: Record<string, string> = {};
                
                if (sku.specList && Array.isArray(sku.specList)) {
                  (sku.specList as JsonRecord[]).forEach((spec: JsonRecord) => {
                    const specName = toStr(orChain(spec.specName, spec.name, spec.specKey, '')).toLowerCase();
                    const specValue = toStr(orChain(spec.specValue, spec.value, spec.specVal, ''));
                    if (specName && specValue) {
                      attributes[specName] = specValue;
                      if (specName === 'color' || specName === 'farge' || specName === 'colour') {
                        variantName = specValue;
                      } else if (!variantName || variantName === 'Standard') {
                        variantName = specValue;
                      }
                    }
                  });
                }
                
                // Try multiple image fields
                const variantImage = toStr(orChain(
                  sku.thumbUrl, sku.image, sku.imgUrl, sku.goodsImg,
                  sku.imageUrl, sku.thumb, sku.img,
                  firstArrayItem(sku.gallery),
                  firstArrayItem(sku.images),
                  ''
                ));
                
                const price = parseFloat(toStr(orChain(sku.goodsPrice, sku.salePrice, sku.price, sku.minPrice, '0')));
                
                // Preserve supplier SKU and stock when the API provides them
                const skuId = orChain(sku.skuId, sku.sku_id, sku.sku, sku.id);
                const stockRaw = sku.stock ?? sku.quantity ?? sku.stockQuantity ?? sku.inventory;
                const stock = typeof stockRaw === 'number' ? stockRaw : (typeof stockRaw === 'string' && stockRaw !== '' ? parseInt(stockRaw, 10) : undefined);
                
                console.log(`[TemuScraper] Variant: ${variantName}, Price: ${price}, Image: ${variantImage ? 'Yes' : 'No'}, SKU: ${skuId || '-'}, Stock: ${stock ?? '-'}`);
                
                return {
                  name: variantName,
                  price: price > 0 ? price : 0,
                  attributes,
                  image: variantImage && variantImage.startsWith('http') ? variantImage : undefined,
                  sku: skuId ? String(skuId) : undefined,
                  stock: Number.isFinite(stock) ? stock : undefined,
                };
              });
              
              if (variants.length > 0) {
                console.log(`[TemuScraper] ✅ Returning ${variants.length} variants from API`);
                return variants;
              }
            } else {
              console.log(`[TemuScraper] No SKU list found in API response structure`);
            }
          } else {
            console.log(`[TemuScraper] API returned status ${response.status}`);
          }
        } catch (e) {
          // Continue to next endpoint
          console.log(`[TemuScraper] Endpoint failed:`, e instanceof Error ? e.message : String(e));
          continue;
        }
      }
    } catch (error) {
      console.warn(`[TemuScraper] API fetch failed:`, error instanceof Error ? error.message : String(error));
    }
    
    return null;
  }

  /**
   * Extract title from URL path (better than page scraping when blocked)
   */
  private extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(p => p && p !== "no");
      const lastPart = pathParts[pathParts.length - 1] || "";
      
      if (lastPart.includes("-g-")) {
        // Extract title part before product ID
        const titlePart = lastPart.split("-g-")[0];
        if (titlePart) {
          // Decode URL-encoded characters (may be double-encoded)
          let decoded = titlePart;
          try {
            decoded = decodeURIComponent(titlePart);
            // Check for double encoding
            if (decoded.includes('%')) {
              decoded = decodeURIComponent(decoded);
            }
          } catch {
            // If decoding fails, use original
          }
          
          // Replace URL-encoded Norwegian characters manually if needed
          decoded = decoded
            .replace(/%C3%A5/g, 'å')
            .replace(/%C3%A6/g, 'æ')
            .replace(/%C3%B8/g, 'ø')
            .replace(/%C3%85/g, 'Å')
            .replace(/%C3%86/g, 'Æ')
            .replace(/%C3%98/g, 'Ø')
            .replace(/%20/g, ' ')
            .replace(/\+/g, ' ');
          
          // Keep numbers: pack counts ("3 stk") and model numbers ("iphone 16") are meaningful
          return decoded
            .split("-")
            .map(word => {
              // Capitalize first letter
              return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(" ")
            .replace(/\.html.*/, "")
            .trim();
        }
      }
      
      return "Temu product";
    } catch {
      return "Temu product";
    }
  }

  async scrapePrice(url: string): Promise<number> {
    const result = await this.scrapeProduct(url);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Unable to scrape Temu price");
    }
    return result.data.price.amount;
  }

  async scrapeImages(url: string): Promise<string[]> {
    const result = await this.scrapeProduct(url);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Unable to scrape Temu images");
    }
    return result.data.images;
  }

  async scrapeDescription(url: string): Promise<string> {
    const result = await this.scrapeProduct(url);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Unable to scrape Temu description");
    }
    return result.data.description;
  }

  /**
   * Fetch HTML and extract variants using axios + cheerio (no Puppeteer)
   */
  private async fetchHtmlAndExtractVariants(url: string): Promise<{ variants?: ProductVariant[]; images?: string[]; description?: string }> {
    try {
      console.log(`📡 Fetching HTML for variants from: ${url.substring(0, 80)}...`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'no,en-US;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 30000,
        maxRedirects: 5,
      });

      const $ = cheerio.load(response.data);
      
      // First, try to find product data in script tags (most reliable)
      // Uses a plain for-of loop (not `.each`) so TypeScript can correctly
      // narrow `productData` afterwards instead of widening it to `never`
      // when a closure reassigns a captured `let` variable.
      let productData: JsonRecord | null = null;
      const scriptTags = $('script');

      for (const el of scriptTags.toArray()) {
        const scriptContent = $(el).html() || '';
        
        // Look for window.__NEXT_DATA__ or similar structures
        if (scriptContent.includes('__NEXT_DATA__') || scriptContent.includes('window.__INITIAL_STATE__') || scriptContent.includes('productData') || scriptContent.includes('goodsDetail')) {
          try {
            // Extract JSON from various patterns
            let jsonData: JsonRecord | null = null;
            
            // Pattern 1: window.__NEXT_DATA__ = {...}
            const nextDataMatch = scriptContent.match(/window\.__NEXT_DATA__\s*=\s*({[\s\S]*?});/);
            if (nextDataMatch) {
              jsonData = JSON.parse(nextDataMatch[1]);
              const props = jsonData?.props as JsonRecord | undefined;
              const pageProps = props?.pageProps as JsonRecord | undefined;
              const initialState = pageProps?.initialState as JsonRecord | undefined;
              const candidate = orChain(
                initialState?.goodsDetail,
                pageProps?.goodsDetail,
                pageProps?.product,
                jsonData?.product
              );
              productData = isRecord(candidate) ? candidate : null;
            }
            
            // Pattern 2: var productData = {...}
            if (!productData) {
              const varMatch = scriptContent.match(/var\s+productData\s*=\s*({[\s\S]*?});/);
              if (varMatch) {
                jsonData = JSON.parse(varMatch[1]);
                productData = jsonData;
              }
            }
            
            // Pattern 3: Try to find any JSON object that might contain product data
            if (!productData) {
              const jsonMatch = scriptContent.match(/{[\s\S]{100,}}/);
              if (jsonMatch) {
                try {
                  jsonData = JSON.parse(jsonMatch[0]);
                  // Check if it looks like product data
                  if (jsonData && (jsonData.variants || jsonData.skus || jsonData.goodsDetail || jsonData.product)) {
                    const candidate = orChain(jsonData.variants, jsonData.skus, jsonData.goodsDetail, jsonData.product);
                    productData = isRecord(candidate) ? candidate : null;
                  }
                } catch (e) {
                  // Not valid JSON, continue
                }
              }
            }
          } catch (e) {
            // Continue with next script
          }
        }
      }
      
      console.log('📦 Found product data in script:', productData ? 'Yes' : 'No');
      if (productData) {
        console.log('📦 Product data keys:', Object.keys(productData).join(', '));
        if (productData.skus) console.log('📦 skus type:', Array.isArray(productData.skus) ? `Array(${productData.skus.length})` : typeof productData.skus);
        if (productData.variants) console.log('📦 variants type:', Array.isArray(productData.variants) ? `Array(${productData.variants.length})` : typeof productData.variants);
        if (productData.goodsSkuList) console.log('📦 goodsSkuList type:', Array.isArray(productData.goodsSkuList) ? `Array(${productData.goodsSkuList.length})` : typeof productData.goodsSkuList);
      }
      
      // Extract variants from product data and HTML
      const variants: ProductVariant[] = [];
      const images: string[] = [];
      
      // Method 1: Extract from found product data
      if (productData) {
        try {
          // Try different property names for variants/skus
          // Deep search for variant data in various structures
          const detail = productData.detail as JsonRecord | undefined;
          const productInfo = productData.productInfo as JsonRecord | undefined;
          const variantList = productData.skus || 
                            productData.variants || 
                            productData.goodsSkuList ||
                            productData.goodsSku ||
                            productData.skuInfo ||
                            productData.skuList ||
                            (productData.skuList ? Object.values(productData.skuList as JsonRecord) : null) ||
                            (detail?.skus ? detail.skus : null) ||
                            (detail?.goodsSkuList ? detail.goodsSkuList : null) ||
                            (productInfo?.skus ? productInfo.skus : null);
          
          // If variantList is not an array but an object, try to convert it
          let variantsArray: JsonRecord[] = [];
          if (variantList) {
            if (Array.isArray(variantList)) {
              variantsArray = variantList;
            } else if (typeof variantList === 'object') {
              // Try to extract variants from object structure
              const variantObj = variantList as JsonRecord;
              variantsArray = Object.values(variantObj) as JsonRecord[];
              // If that doesn't work, check if it's a nested structure
              if (variantsArray.length === 0 && variantObj.list) {
                variantsArray = Array.isArray(variantObj.list) ? (variantObj.list as JsonRecord[]) : [];
              }
            }
          }
          
          if (variantsArray.length > 0) {
            console.log(`✅ Found ${variantsArray.length} variants in product data`);
            
            variantsArray.forEach((variant: JsonRecord, index: number) => {
              // Extract variant name (usually in specList or name property)
              let variantName = toStr(orChain(variant.name, variant.title, ''));
              const attributes: Record<string, string> = {};
              
              // Extract attributes from specList or similar
              if (variant.specList && Array.isArray(variant.specList)) {
                (variant.specList as JsonRecord[]).forEach((spec: JsonRecord) => {
                  const specName = toStr(orChain(spec.specName, spec.name, ''));
                  const specValue = toStr(orChain(spec.specValue, spec.value, ''));
                  if (specName && specValue) {
                    attributes[specName.toLowerCase()] = specValue;
                    if (!variantName) {
                      variantName = specValue;
                    } else if (specName.toLowerCase() === 'color' || specName.toLowerCase() === 'farge') {
                      variantName = specValue;
                    }
                  }
                });
              }
              
              // If no name found, create one from attributes
              if (!variantName || variantName === '') {
                variantName = Object.values(attributes).join(' ') || `Variant ${index + 1}`;
              }
              
              // Extract price — never invent 9.99 USD placeholder
              const price = orChain(variant.salePrice, variant.price, variant.goodsPrice, 0);
              const priceAmount = typeof price === 'string' ? parseFloat(price.replace(/[^0-9.]/g, '')) : parseFloat(String(price));
              
              // Extract image
              const variantImage = toStr(orChain(variant.thumbUrl, variant.image, variant.imgUrl, variant.goodsImg, ''));
              
              variants.push({
                name: variantName,
                price: priceAmount > 0 ? priceAmount : 0,
                attributes: attributes,
                image: variantImage && variantImage.startsWith('http') ? variantImage : undefined,
              });
            });
          }
          
          // Extract images from product data - try multiple sources
          const imageSources: unknown[] = [];
          
          // Try various image array properties
          if (productData.gallery) imageSources.push(productData.gallery);
          if (productData.images) imageSources.push(productData.images);
          if (productData.imgList) imageSources.push(productData.imgList);
          if (productData.goodsGallery) imageSources.push(productData.goodsGallery);
          if (productData.goodsImgList) imageSources.push(productData.goodsImgList);
          if (productData.productImages) imageSources.push(productData.productImages);
          
          // Also try nested paths
          const goodsInfo = productData.goodsInfo as JsonRecord | undefined;
          if (goodsInfo?.gallery) imageSources.push(goodsInfo.gallery);
          if (goodsInfo?.images) imageSources.push(goodsInfo.images);
          if (detail?.gallery) imageSources.push(detail.gallery);
          if (detail?.images) imageSources.push(detail.images);
          
          // Extract images from variant data
          if (variantsArray && variantsArray.length > 0) {
            variantsArray.forEach((variant: JsonRecord) => {
              const variantImg = variant.thumbUrl || 
                               variant.image || 
                               variant.imgUrl || 
                               variant.goodsImg ||
                               variant.goodsImage ||
                               variant.img;
              if (variantImg && typeof variantImg === 'string' && variantImg.startsWith('http')) {
                imageSources.push([variantImg]);
              }
              
              // Also check variant's gallery
              if (variant.gallery && Array.isArray(variant.gallery)) {
                imageSources.push(variant.gallery);
              }
            });
          }
          
          // Process all image sources
          imageSources.forEach((imageList: unknown) => {
            if (Array.isArray(imageList)) {
              imageList.forEach((img: unknown) => {
                const imgObj = typeof img === 'string' ? null : (img as JsonRecord | null);
                const imgUrl = typeof img === 'string' 
                  ? img 
                  : String(imgObj?.url || imgObj?.src || imgObj?.thumbUrl || imgObj?.imageUrl || imgObj?.original || '');
                if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('http') && imgUrl.includes('img.kwcdn.com')) {
                  const normalized = imgUrl.split('?')[0];
                  if (!images.includes(normalized)) {
                    images.push(normalized);
                  }
                }
              });
            }
          });
          
          // Fallback: single goodsImg
          if (images.length === 0 && productData.goodsImg) {
            if (typeof productData.goodsImg === 'string' && productData.goodsImg.startsWith('http')) {
              images.push(productData.goodsImg);
            }
          }
        } catch (e) {
          console.warn('⚠️ Error extracting from product data:', e);
        }
      }

      // Method 2: Try JSON-LD structured data
      try {
        const jsonLdScripts = $('script[type="application/ld+json"]');
        jsonLdScripts.each((_, el) => {
          try {
            const json = JSON.parse($(el).text());
            if (json['@type'] === 'Product' || json['@type'] === 'ProductGroup') {
              // Extract variants from offers or variantGroup
              if (json.offers && Array.isArray(json.offers)) {
                json.offers.forEach((offer: JsonRecord, index: number) => {
                  if (offer.availability === 'https://schema.org/InStock' || offer.availability === 'InStock') {
                    variants.push({
                      name: toStr(orChain(offer.name, `Variant ${index + 1}`)),
                      price: offer.price ? parseFloat(toStr(offer.price)) : 0,
                      attributes: {
                        color: toStr(offer.color),
                        size: toStr(offer.size),
                      },
                      image: asOptionalString(offer.image),
                    });
                  }
                });
              }
              
              // Extract images
              if (json.image) {
                const productImages = Array.isArray(json.image) ? json.image : [json.image];
                productImages.forEach((img: unknown) => {
                  const imgRecord = typeof img === 'string' ? null : (img as JsonRecord | null);
                  const imgUrl = typeof img === 'string' ? img : toStr(orChain(imgRecord?.url, imgRecord?.['@id'], ''));
                  if (imgUrl && imgUrl.startsWith('http')) {
                    images.push(imgUrl);
                  }
                });
              }
            }
          } catch (e) {
            // Continue with next script
          }
        });
      } catch (e) {
        // Continue with other methods
      }

      // Method 3: If no variants found, try to extract from HTML directly
      if (variants.length === 0) {
        try {
          console.log('🔍 Trying to extract variants from HTML elements...');
          console.log('🔍 HTML length:', response.data.length, 'chars');
          
          // First, try to find JSON data in ALL script tags that might contain variant info
          const allScripts = $('script').toArray();
          console.log(`🔍 Checking ${allScripts.length} script tags for variant data...`);
          
          for (const scriptEl of allScripts) {
            const scriptContent = $(scriptEl).html() || '';
            if (scriptContent.length > 100 && (
              scriptContent.includes('"sku') || 
              scriptContent.includes('"variant') || 
              scriptContent.includes('"color') ||
              scriptContent.includes('"farge') ||
              scriptContent.includes('svart') ||
              scriptContent.includes('rød') ||
              scriptContent.includes('goodsSku')
            )) {
              try {
                // Try to extract the entire JSON object
                const jsonStart = scriptContent.indexOf('{');
                const jsonEnd = scriptContent.lastIndexOf('}');
                if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                  const jsonStr = scriptContent.substring(jsonStart, jsonEnd + 1);
                  try {
                    const parsed = JSON.parse(jsonStr);
                    // Search recursively for variant data
                    const searchForVariants = (obj: unknown, depth = 0): JsonRecord[] => {
                      if (depth > 5) return []; // Limit recursion
                      const found: JsonRecord[] = [];
                      
                      if (obj && typeof obj === 'object') {
                        if (Array.isArray(obj)) {
                          obj.forEach(item => found.push(...searchForVariants(item, depth + 1)));
                        } else {
                          for (const [key, value] of Object.entries(obj as JsonRecord)) {
                            const keyLower = key.toLowerCase();
                            if ((keyLower.includes('sku') || keyLower.includes('variant')) && Array.isArray(value)) {
                              found.push(...(value as JsonRecord[]));
                            } else {
                              found.push(...searchForVariants(value, depth + 1));
                            }
                          }
                        }
                      }
                      return found;
                    };
                    
                    const foundVariants = searchForVariants(parsed);
                    if (foundVariants.length > 0) {
                      console.log(`✅ Found ${foundVariants.length} potential variants in script JSON`);
                      foundVariants.forEach((v: JsonRecord, idx: number) => {
                        if (v && typeof v === 'object') {
                          const name = orChain(v.name, v.title, v.specValue, v.color, `Variant ${idx + 1}`);
                          const price = parseFloat(toStr(orChain(v.price, v.salePrice, v.goodsPrice, '0')));
                          variants.push({
                            name: String(name),
                            price: price > 0 ? price : 0,
                            attributes: v.specList ? Object.fromEntries(
                              (Array.isArray(v.specList) ? v.specList as JsonRecord[] : []).map((s: JsonRecord) => [
                                toStr(orChain(s.specName, s.name, '')).toLowerCase(),
                                toStr(orChain(s.specValue, s.value, ''))
                              ])
                            ) : (v.color ? { color: String(v.color) } : {}),
                            image: asOptionalString(orChain(v.image, v.thumbUrl, v.imgUrl, undefined)),
                          });
                        }
                      });
                    }
                  } catch (e) {
                    // Not valid JSON, continue
                  }
                }
              } catch (e) {
                // Continue
              }
            }
          }
          
          // Try to find any mention of color variants in the HTML
          const htmlLower = response.data.toLowerCase();
          const hasColorMention = htmlLower.includes('farge') || htmlLower.includes('color') || htmlLower.includes('svart') || htmlLower.includes('rød');
          console.log('🔍 HTML contains color mentions:', hasColorMention);
          
          if (variants.length > 0) {
            console.log(`✅ Found ${variants.length} variants from script tag JSON parsing`);
          }
          
          // Look for color/variant selection elements
          const colorSelectors = [
            '[class*="color"]',
            '[class*="farge"]',
            '[data-testid*="color"]',
            '[class*="sku"]',
            '[class*="variant"]',
            '[class*="option"]',
            'button[aria-label*="color"]',
            'div[role="button"][class*="color"]',
            '[class*="sku-item"]',
            '[class*="variant-item"]',
          ];
          
          console.log('🔍 Checking', colorSelectors.length, 'selectors...');
          
          const seenVariants = new Set<string>();
          // Prefer Temu URL page price (NOK). Never invent 9.99 USD.
          const urlPrice = extractTemuPriceNOKFromUrl(url);
          const basePrice = urlPrice.amountNOK > 0 ? urlPrice.amountNOK : 0;
          let totalElementsFound = 0;
          
          colorSelectors.forEach((selector) => {
            const elements = $(selector);
            const count = elements.length;
            if (count > 0) {
              console.log(`🔍 Found ${count} elements for selector: ${selector}`);
              totalElementsFound += count;
            }
            
            elements.each((_, el) => {
              const $el = $(el);
              
              // Try to find variant name/text
              const variantText = $el.text().trim() || 
                               $el.attr('title') || 
                               $el.attr('aria-label') ||
                               $el.find('[class*="name"]').text().trim() ||
                               $el.find('[class*="label"]').text().trim();
              
              // Skip if empty or too long
              if (!variantText || variantText.length > 100 || 
                  variantText.toLowerCase().includes('add to cart') || 
                  variantText.toLowerCase().includes('buy') ||
                  variantText.toLowerCase().includes('legg til')) {
                return;
              }
              
              // Extract color name (Norwegian and English)
              const colorMap: Record<string, string> = {
                'svart': 'Svart',
                'black': 'Svart',
                'rød': 'Rød',
                'red': 'Rød',
                'gul': 'Gul',
                'yellow': 'Gul',
                'blå': 'Blå',
                'blue': 'Blå',
                'grønn': 'Grønn',
                'green': 'Grønn',
                'hvit': 'Hvit',
                'white': 'Hvit',
                'rosa': 'Rosa',
                'pink': 'Rosa',
                'lilla': 'Lilla',
                'purple': 'Lilla',
              };
              
              let colorName = '';
              for (const [key, value] of Object.entries(colorMap)) {
                if (variantText.toLowerCase().includes(key)) {
                  colorName = value;
                  break;
                }
              }
              
              // If no color match, use the text itself (might be bundle name)
              if (!colorName) {
                colorName = variantText;
              }
              
              // Try to find variant image
              const variantImg = $el.find('img').first();
              let variantImage = variantImg.attr('src') || 
                                variantImg.attr('data-src') || 
                                variantImg.attr('data-lazy-src') ||
                                variantImg.attr('data-original');
              
              // If no image in variant element, try to find in parent
              if (!variantImage) {
                variantImage = $el.closest('[class*="variant"], [class*="sku"], [class*="color"]')
                                 .find('img').first()
                                 .attr('src') || 
                                 $el.closest('[class*="variant"], [class*="sku"], [class*="color"]')
                                 .find('img').first()
                                 .attr('data-src');
              }
              
              // Normalize image URL
              if (variantImage && !variantImage.startsWith('http')) {
                if (variantImage.startsWith('//')) {
                  variantImage = 'https:' + variantImage;
                } else if (variantImage.startsWith('/')) {
                  variantImage = 'https://www.temu.com' + variantImage;
                }
              }
              
              // Also try to find image in nearby image elements
              if (!variantImage || !variantImage.includes('img.kwcdn.com')) {
                const nearbyImg = $el.find('img').first();
                if (nearbyImg.length) {
                  const nearbySrc = nearbyImg.attr('src') || 
                                   nearbyImg.attr('data-src') || 
                                   nearbyImg.attr('data-lazy-src');
                  if (nearbySrc && nearbySrc.includes('img.kwcdn.com')) {
                    variantImage = nearbySrc.startsWith('http') ? nearbySrc : 'https:' + nearbySrc;
                  }
                }
              }
              
              // Try to extract price from variant (if available)
              const priceText = $el.find('[class*="price"]').text();
              const priceMatch = priceText.match(/[\d,]+\.?\d*/);
              const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '').replace(/\s/g, '')) : basePrice;
              
              // Create unique key
              const variantKey = `${colorName}-${variantImage || 'noimg'}`;
              
              if (!seenVariants.has(variantKey) && colorName) {
                seenVariants.add(variantKey);
                
                variants.push({
                  name: colorName,
                  price: price > 0 ? price : basePrice,
                  attributes: {
                    color: colorName,
                  },
                  image: variantImage && variantImage.startsWith('http') ? variantImage : undefined,
                });
              }
            });
          });
          
          console.log(`✅ Extracted ${variants.length} variants from ${totalElementsFound} HTML elements`);
          
          // If still no variants, try to find them in data attributes
          if (variants.length === 0) {
            console.log('🔍 No variants found, checking data attributes...');
            $('[data-sku], [data-variant], [data-color]').each((_, el) => {
              const $el = $(el);
              const color = $el.attr('data-color') || $el.text().trim();
              const img = $el.find('img').attr('src') || $el.find('img').attr('data-src');
              
              if (color && color.length < 50) {
                console.log(`🔍 Found potential variant: ${color}`);
                variants.push({
                  name: color,
                  price: basePrice,
                  attributes: { color },
                  image: img && img.startsWith('http') ? img : undefined,
                });
              }
            });
            console.log(`✅ Extracted ${variants.length} variants from data attributes`);
          }
        } catch (e) {
          console.warn("⚠️ Error extracting variants from HTML:", e);
        }
      }

      // Method 4: Extract all product images from HTML
      // Improved extraction to find variant-specific images
      try {
        const seenImageHashes = new Set<string>();
        const seenImageUrls = new Set<string>();
        
        // Strategy 1: Extract from all img tags
        $('img').each((_, el) => {
          const src = $(el).attr('src') || 
                     $(el).attr('data-src') || 
                     $(el).attr('data-lazy-src') || 
                     $(el).attr('data-original') ||
                     $(el).attr('data-img') ||
                     $(el).attr('data-image-url');
          
          if (src && src.startsWith('http')) {
            const normalizedSrc = src.split('?')[0]; // Remove query params
            
            // Only add if it's a product image from kwcdn.com
            if (normalizedSrc.includes('img.kwcdn.com') && normalizedSrc.includes('product')) {
              // Extract image hash/filename to detect duplicates
              const hashMatch = normalizedSrc.match(/([a-f0-9-]{32,})\.(jpg|png|webp|jpeg)/i);
              const imageHash = hashMatch ? hashMatch[1] : normalizedSrc.split('/').pop()?.split('.')[0] || '';
              
              // Use hash or full URL to detect duplicates
              const uniqueKey = imageHash || normalizedSrc;
              
              if (uniqueKey && !seenImageHashes.has(uniqueKey) && !seenImageUrls.has(normalizedSrc)) {
                images.push(normalizedSrc);
                seenImageHashes.add(uniqueKey);
                seenImageUrls.add(normalizedSrc);
              }
            }
          }
        });
        
        // Strategy 2: Extract from data attributes (for lazy-loaded images)
        $('[data-img], [data-image], [data-thumb], [data-variant-image]').each((_, el) => {
          const $el = $(el);
          const dataImg = $el.attr('data-img') || 
                         $el.attr('data-image') || 
                         $el.attr('data-thumb') || 
                         $el.attr('data-variant-image');
          
          if (dataImg && dataImg.startsWith('http') && dataImg.includes('img.kwcdn.com')) {
            const normalizedSrc = dataImg.split('?')[0];
            if (!seenImageUrls.has(normalizedSrc)) {
              images.push(normalizedSrc);
              seenImageUrls.add(normalizedSrc);
            }
          }
        });
        
        // Strategy 3: Extract from background-image styles
        $('[style*="background-image"], [style*="backgroundImage"]').each((_, el) => {
          const style = $(el).attr('style') || '';
          const urlMatch = style.match(/url\(["']?([^"']+)["']?\)/);
          if (urlMatch && urlMatch[1]) {
            const imgUrl = urlMatch[1].split('?')[0];
            if (imgUrl.includes('img.kwcdn.com') && !seenImageUrls.has(imgUrl)) {
              images.push(imgUrl);
              seenImageUrls.add(imgUrl);
            }
          }
        });
        
        // Strategy 4: Try to extract from JSON data in script tags (gallery images)
        try {
          $('script[type="application/json"], script:contains("gallery"), script:contains("images")').each((_, el) => {
            try {
              const scriptText = $(el).html() || '';
              const jsonMatch = scriptText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const jsonData = JSON.parse(jsonMatch[0]);
                
                // Recursively search for image URLs
                const findImages = (obj: unknown): string[] => {
                  const found: string[] = [];
                  if (typeof obj === 'string' && obj.includes('img.kwcdn.com') && obj.includes('product')) {
                    found.push(obj.split('?')[0]);
                  } else if (Array.isArray(obj)) {
                    obj.forEach(item => found.push(...findImages(item)));
                  } else if (obj && typeof obj === 'object') {
                    Object.values(obj).forEach(value => found.push(...findImages(value)));
                  }
                  return found;
                };
                
                const foundImages = findImages(jsonData);
                foundImages.forEach(img => {
                  const normalized = img.split('?')[0];
                  if (!seenImageUrls.has(normalized)) {
                    images.push(normalized);
                    seenImageUrls.add(normalized);
                  }
                });
              }
            } catch {
              // Skip invalid JSON
            }
          });
        } catch {
          // Continue if JSON extraction fails
        }
        
        console.log(`✅ Extracted ${images.length} unique images from HTML`);
      } catch (e) {
        console.warn('⚠️ Error extracting images from HTML:', e);
      }

      // Extract description
      let description = '';
      try {
        description = $('meta[property="og:description"]').attr('content') || 
                     $('meta[name="description"]').attr('content') || 
                     $('[class*="description"]').first().text() || 
                     '';
      } catch (e) {
        // Continue
      }

      console.log(`✅ Extracted ${variants.length} variants and ${images.length} images from HTML`);

      return {
        variants: variants.length > 0 ? variants : undefined,
        images: images.length > 0 ? images : undefined,
        description: description || undefined,
      };
    } catch (error) {
      console.warn("⚠️ Error fetching HTML:", error instanceof Error ? error.message : String(error));
      return {};
    }
  }
}

