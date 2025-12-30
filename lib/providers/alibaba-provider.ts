import "server-only";

import type { ImportProvider, RawProduct, MappedProduct } from "./types";
import type { ScrapedProductData, ProductVariant } from "@/lib/scrapers/types";
import axios from "axios";
import * as cheerio from "cheerio";
import { normalizeUrl as normalizeUrlUtil, isValidAlibabaUrl } from "@/lib/utils/url-validation";

/**
 * Alibaba import provider
 * Fetches product data using structured data (JSON-LD, embedded JSON) first,
 * falling back to HTML parsing only when necessary.
 */
export class AlibabaProvider implements ImportProvider {
  getName(): string {
    return "alibaba";
  }

  canHandle(url: string): boolean {
    return isValidAlibabaUrl(url);
  }

  normalizeUrl(url: string): string {
    return normalizeUrlUtil(url);
  }

  async fetchProduct(url: string): Promise<RawProduct> {
    const normalizedUrl = this.normalizeUrl(url);
    
    try {
      console.log(`[AlibabaProvider] Fetching product from: ${normalizedUrl}`);
      
      // Fetch HTML with retry logic
      const html = await this.fetchHtmlWithRetry(normalizedUrl);
      
      // Check for blocking after fetch
      if (this.isBlocked(html)) {
        throw new Error("Alibaba blocked request (captcha/verify) – prøv annen URL / bruk cookie");
      }
      
      const $ = cheerio.load(html);

      // Try to extract data using structured data first
      let productData = this.extractFromJsonLd($);
      
      if (!productData || !this.hasEnoughData(productData)) {
        console.log(`[AlibabaProvider] JSON-LD insufficient, trying embedded JSON...`);
        const embeddedData = this.extractFromEmbeddedJson($, html);
        productData = this.mergeProductData(productData, embeddedData);
      }

      // Check if we have critical fields, use HTML fallback for missing ones
      const hasTitle = !!(productData?.title || productData?.name);
      const hasImages = productData?.images && productData.images.length > 0;
      const hasPrice = !!productData?.price;

      // Use HTML parsing to fill in missing critical fields
      if (!hasTitle || !hasImages || !hasPrice) {
        console.log(`[AlibabaProvider] Missing critical fields (title: ${hasTitle}, images: ${hasImages}, price: ${hasPrice}), using HTML fallback...`);
        const htmlData = this.extractFromHtml($, normalizedUrl);
        
        // Only merge missing fields from HTML
        if (htmlData) {
          if (!hasTitle && htmlData.title) {
            productData = productData || {};
            productData.title = htmlData.title;
          }
          if (!hasImages && htmlData.images && htmlData.images.length > 0) {
            productData = productData || {};
            productData.images = htmlData.images;
          }
          if (!hasPrice && htmlData.price) {
            productData = productData || {};
            productData.price = htmlData.price;
          }
          // Merge other fields if available
          productData = this.mergeProductData(productData, htmlData);
        }
      }

      // Final fallback: if still no data, try full HTML parsing
      if (!productData || !this.hasEnoughData(productData)) {
        console.log(`[AlibabaProvider] Structured data insufficient, falling back to full HTML parsing...`);
        const htmlData = this.extractFromHtml($, normalizedUrl);
        productData = this.mergeProductData(productData, htmlData);
      }

      if (!productData || !this.hasEnoughData(productData)) {
        throw new Error("Kunne ikke hente nok produktdata fra Alibaba-siden");
      }

      // Add metadata
      productData.metadata = productData.metadata || {};
      productData.metadata.source = "alibaba";
      productData.metadata.url = normalizedUrl;
      productData.metadata.warnings = productData.warnings || [];

      return productData as RawProduct;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ukjent feil ved henting av produktdata";
      throw new Error(`Feil ved henting av Alibaba-produkt: ${message}`);
    }
  }

  /**
   * Check if HTML contains blocking indicators (captcha, verify, etc.)
   */
  private isBlocked(html: string): boolean {
    const blockedIndicators = [
      "captcha",
      "verify",
      "punish",
      "Sorry",
      "Access denied",
      "access denied",
      "blocked",
      "security check",
      "verification",
      "robot",
      "unusual traffic",
    ];
    
    const htmlLower = html.toLowerCase();
    return blockedIndicators.some(indicator => htmlLower.includes(indicator.toLowerCase()));
  }

  /**
   * Fetch HTML with retry logic and rate limiting
   */
  private async fetchHtmlWithRetry(url: string, maxRetries = 3): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Rate limiting: wait between requests
        if (attempt > 1) {
          const delay = Math.min(1000 * attempt, 5000); // Exponential backoff, max 5s
          console.log(`[AlibabaProvider] Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,no;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
          },
          timeout: 30000,
          maxRedirects: 5,
          validateStatus: (status) => status < 500, // Don't throw on 4xx
        });

        if (response.status === 200) {
          const html = response.data;
          
          // Check for blocking indicators
          if (this.isBlocked(html)) {
            console.log(`[AlibabaProvider] Blocked detected (status: ${response.status}, blocked: yes)`);
            throw new Error("Alibaba blocked request (captcha/verify) – prøv annen URL / bruk cookie");
          }
          
          console.log(`[AlibabaProvider] Fetch successful (status: ${response.status}, blocked: no)`);
          return html;
        }

        // If 4xx, don't retry
        if (response.status >= 400 && response.status < 500) {
          console.log(`[AlibabaProvider] Client error (status: ${response.status})`);
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // For 5xx or network errors, retry
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on certain errors
        if (axios.isAxiosError(error)) {
          if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
            throw error; // Don't retry client errors
          }
        }
        
        if (attempt === maxRetries) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error("Failed to fetch HTML after retries");
  }

  mapToProduct(raw: RawProduct, originalUrl: string): MappedProduct {
    const data = raw as any;
    
    // Extract price (handle intervals)
    let price = { amount: 0, currency: "USD" };
    if (data.price) {
      if (typeof data.price === "object") {
        price = {
          amount: data.price.fromPrice || data.price.amount || data.price.minPrice || 0,
          currency: data.price.currency || "USD",
        };
      } else if (typeof data.price === "number") {
        price = { amount: data.price, currency: "USD" };
      }
    }

    // If price is 0 or missing, try to extract from metadata
    if (price.amount === 0 && data.metadata?.priceRange) {
      const range = data.metadata.priceRange;
      price.amount = range.fromPrice || range.minPrice || 0;
    }

    // Extract variants
    let variants: ProductVariant[] = [];
    if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
      variants = data.variants.map((v: any) => ({
        name: v.name || "Standard",
        price: v.price || price.amount,
        attributes: v.attributes || {},
        image: v.image,
        stock: v.stock || 0,
      }));
    } else if (data.options && Array.isArray(data.options)) {
      // Convert options to variants
      variants = data.options.map((opt: any) => ({
        name: opt.name || opt.label || "Standard",
        price: opt.price || price.amount,
        attributes: opt.attributes || {},
        image: opt.image,
        stock: opt.stock || 0,
      }));
    }

    // If no variants, create default
    if (variants.length === 0) {
      variants = [{
        name: "Standard",
        price: price.amount || 0,
        attributes: {},
        stock: 0,
      }];
    }

    // Build specs (include MOQ if available)
    const specs: Record<string, string> = { ...(data.specs || {}) };
    if (data.moq) {
      specs["MOQ"] = String(data.moq);
    }
    if (data.metadata?.moq) {
      specs["MOQ"] = String(data.metadata.moq);
    }

    // Add price range to specs if available
    if (data.metadata?.priceRange) {
      const range = data.metadata.priceRange;
      if (range.fromPrice && range.toPrice && range.fromPrice !== range.toPrice) {
        specs["Prisintervall"] = `${range.fromPrice} - ${range.toPrice} ${price.currency}`;
      }
    }

    return {
      supplier: "alibaba",
      url: originalUrl,
      title: data.title || data.name || "Alibaba Produkt",
      description: data.description || data.longDescription || "",
      price,
      images: data.images || [],
      specs,
      shippingEstimate: data.shippingEstimate || data.metadata?.shipping,
      availability: data.availability !== false,
      variants,
    };
  }

  /**
   * Extract product data from JSON-LD structured data
   */
  private extractFromJsonLd($: cheerio.CheerioAPI): any {
    try {
      const jsonLdScripts = $('script[type="application/ld+json"]');
      let productData: any = null;

      jsonLdScripts.each((_, el) => {
        try {
          const jsonText = $(el).text();
          const json = JSON.parse(jsonText);
          
          // Look for Product or ProductGroup schema
          if (json['@type'] === 'Product' || json['@type'] === 'http://schema.org/Product') {
            productData = {
              title: json.name || json.title,
              description: json.description,
              images: this.extractImagesFromJsonLd(json),
              price: this.extractPriceFromJsonLd(json),
              specs: this.extractSpecsFromJsonLd(json),
              variants: this.extractVariantsFromJsonLd(json),
              moq: this.extractMoqFromJsonLd(json),
            };
            return false; // Stop iteration
          }
        } catch (e) {
          // Continue with next script
        }
      });

      return productData;
    } catch (error) {
      console.warn(`[AlibabaProvider] Error extracting JSON-LD:`, error);
      return null;
    }
  }

  /**
   * Extract product data from embedded JSON in script tags
   * Improved parsing for __INIT_DATA__ and __NEXT_DATA__
   */
  private extractFromEmbeddedJson($: cheerio.CheerioAPI, html: string): any {
    try {
      // Try __INIT_DATA__ pattern (with dotall support)
      const initDataPattern = /window\.__INIT_DATA__\s*=\s*({[\s\S]*?});/;
      const initDataMatch = html.match(initDataPattern);
      if (initDataMatch) {
        try {
          const json = JSON.parse(initDataMatch[1]);
          const productData = this.extractFromNestedJson(json);
          if (productData) {
            console.log(`[AlibabaProvider] Found product data in __INIT_DATA__`);
            return productData;
          }
        } catch (e) {
          console.warn(`[AlibabaProvider] Failed to parse __INIT_DATA__:`, e);
        }
      }

      // Try __NEXT_DATA__ from script tag
      const nextDataScript = $('script#__NEXT_DATA__[type="application/json"]');
      if (nextDataScript.length > 0) {
        try {
          const jsonText = nextDataScript.html() || nextDataScript.text();
          if (jsonText) {
            const json = JSON.parse(jsonText);
            const productData = this.extractFromNestedJson(json);
            if (productData) {
              console.log(`[AlibabaProvider] Found product data in __NEXT_DATA__`);
              return productData;
            }
          }
        } catch (e) {
          console.warn(`[AlibabaProvider] Failed to parse __NEXT_DATA__:`, e);
        }
      }

      // Try other common patterns
      const patterns = [
        /window\.__NEXT_DATA__\s*=\s*({[\s\S]*?});/,
        /window\.productData\s*=\s*({[\s\S]*?});/,
        /var\s+productData\s*=\s*({[\s\S]*?});/,
        /"productInfo":\s*({[\s\S]*?}),/,
        /"product":\s*({[\s\S]*?}),/,
        /"data":\s*({[\s\S]*?"product"[\s\S]*?})/,
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          try {
            const json = JSON.parse(match[1]);
            const productData = this.extractFromNestedJson(json);
            if (productData) {
              console.log(`[AlibabaProvider] Found product data in embedded JSON`);
              return productData;
            }
          } catch (e) {
            // Continue to next pattern
          }
        }
      }

      // Try to find JSON in script tags
      const scriptTags = $('script:not([type]), script[type="text/javascript"]');
      for (let i = 0; i < scriptTags.length; i++) {
        const scriptContent = $(scriptTags[i]).html() || '';
        if (scriptContent.length > 100 && (
          scriptContent.includes('product') ||
          scriptContent.includes('price') ||
          scriptContent.includes('title') ||
          scriptContent.includes('__INIT') ||
          scriptContent.includes('__NEXT')
        )) {
          try {
            // Try to extract JSON object (look for large JSON objects)
            const jsonMatch = scriptContent.match(/{[\s\S]{200,}}/);
            if (jsonMatch) {
              const json = JSON.parse(jsonMatch[0]);
              const productData = this.extractFromNestedJson(json);
              if (productData) {
                console.log(`[AlibabaProvider] Found product data in script tag`);
                return productData;
              }
            }
          } catch (e) {
            // Continue
          }
        }
      }

      return null;
    } catch (error) {
      console.warn(`[AlibabaProvider] Error extracting embedded JSON:`, error);
      return null;
    }
  }

  /**
   * Extract product data from nested JSON structure
   */
  private extractFromNestedJson(json: any, depth = 0): any {
    if (depth > 5) return null; // Limit recursion

    if (!json || typeof json !== 'object') return null;

    // Check if this looks like product data
    if (json.title || json.name || json.productName) {
      return {
        title: json.title || json.name || json.productName,
        description: json.description || json.desc || json.productDescription,
        images: this.extractImagesFromNested(json),
        price: this.extractPriceFromNested(json),
        variants: this.extractVariantsFromNested(json),
        moq: json.moq || json.minOrderQuantity || json.minimumOrderQuantity,
        specs: json.specs || json.specifications || json.attributes,
      };
    }

    // Recursively search nested objects
    for (const key in json) {
      if (key.toLowerCase().includes('product') || 
          key.toLowerCase().includes('goods') ||
          key.toLowerCase().includes('item')) {
        const result = this.extractFromNestedJson(json[key], depth + 1);
        if (result) return result;
      }
    }

    // Search in arrays
    if (Array.isArray(json)) {
      for (const item of json) {
        const result = this.extractFromNestedJson(item, depth + 1);
        if (result) return result;
      }
    }

    return null;
  }

  /**
   * Extract product data from HTML using selectors (fallback)
   * Uses multiple alternative selectors for robustness
   */
  private extractFromHtml($: cheerio.CheerioAPI, url: string): any {
    try {
      // Extract title with multiple fallback selectors
      const title = this.extractTitle($);
      
      // Extract price with multiple fallback selectors
      const price = this.extractPrice($);
      
      // Extract images with multiple fallback selectors
      const images = this.extractImages($, url);
      
      // Extract description (optional, not critical)
      const description = this.extractDescription($);
      
      // Extract specs (optional)
      const specs = this.extractSpecs($);
      
      // Extract MOQ (optional)
      const moq = this.extractMoqFromHtml($);
      
      // Extract shipping (optional)
      const shippingEstimate = this.extractShipping($);

      return {
        title,
        description,
        images,
        price,
        specs,
        moq,
        shippingEstimate,
      };
    } catch (error) {
      console.warn(`[AlibabaProvider] Error extracting from HTML:`, error);
      return null;
    }
  }

  /**
   * Extract title with multiple fallback selectors
   */
  private extractTitle($: cheerio.CheerioAPI): string {
    // Try multiple selectors in order of preference
    const selectors = [
      ".module-pc-detail-heading .title",
      ".product-title",
      ".detail-title",
      "h1.product-title",
      "h1.detail-title",
      "h1",
      'meta[property="og:title"]',
      'meta[name="title"]',
      ".title",
      "[class*='title']",
    ];

    for (const selector of selectors) {
      try {
        if (selector.startsWith('meta')) {
          const content = $(selector).attr('content');
          if (content && content.trim()) {
            return content.trim();
          }
        } else {
          const text = $(selector).first().text().trim();
          if (text && text.length > 3) {
            return text;
          }
        }
      } catch {
        // Continue to next selector
      }
    }

    return "";
  }

  /**
   * Extract price with multiple fallback selectors
   */
  private extractPrice($: cheerio.CheerioAPI): any {
    // Try multiple selectors
    const priceSelectors = [
      ".price .price-text",
      ".price-range",
      ".product-price",
      ".detail-price",
      ".unit-price",
      '[class*="price"]',
      '[data-price]',
    ];

    let priceText = "";
    for (const selector of priceSelectors) {
      try {
        const text = $(selector).first().text().trim();
        if (text && text.length > 0) {
          priceText = text;
          break;
        }
      } catch {
        // Continue
      }
    }

    // Also try data attributes
    if (!priceText) {
      const dataPrice = $('[data-price]').first().attr('data-price');
      if (dataPrice) {
        priceText = dataPrice;
      }
    }

    if (priceText) {
      return this.parsePriceRange(priceText);
    }

    return null;
  }

  /**
   * Extract images with multiple fallback selectors
   */
  private extractImages($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const images: string[] = [];
    const seenUrls = new Set<string>();

    // Try multiple image selectors
    const imageSelectors = [
      ".product-image-gallery img",
      ".gallery img",
      ".product-images img",
      ".detail-images img",
      "[class*='image-gallery'] img",
      "[class*='product-image'] img",
      "[class*='gallery'] img",
      "[class*='image'] img",
      ".swiper-slide img",
      ".carousel img",
    ];

    // Extract from selectors
    for (const selector of imageSelectors) {
      try {
        $(selector).each((_, el) => {
          const src = $(el).attr('src') || 
                     $(el).attr('data-src') || 
                     $(el).attr('data-lazy-src') ||
                     $(el).attr('data-original') ||
                     $(el).attr('data-img');
          
          if (src) {
            try {
              const imgUrl = new URL(src, baseUrl).toString();
              if (!seenUrls.has(imgUrl) && this.isValidImageUrl(imgUrl)) {
                images.push(imgUrl);
                seenUrls.add(imgUrl);
              }
            } catch {
              // Skip invalid URLs
            }
          }
        });
      } catch {
        // Continue to next selector
      }
    }

    // Also try meta og:image
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      try {
        const imgUrl = new URL(ogImage, baseUrl).toString();
        if (!seenUrls.has(imgUrl) && this.isValidImageUrl(imgUrl)) {
          images.unshift(imgUrl); // Add to beginning
          seenUrls.add(imgUrl);
        }
      } catch {
        // Skip invalid URL
      }
    }

    // Try to find images in background-image styles
    $('[style*="background-image"]').each((_, el) => {
      try {
        const style = $(el).attr('style') || '';
        const urlMatch = style.match(/url\(["']?([^"']+)["']?\)/);
        if (urlMatch && urlMatch[1]) {
          const imgUrl = new URL(urlMatch[1], baseUrl).toString();
          if (!seenUrls.has(imgUrl) && this.isValidImageUrl(imgUrl)) {
            images.push(imgUrl);
            seenUrls.add(imgUrl);
          }
        }
      } catch {
        // Skip
      }
    });

    return images;
  }

  /**
   * Extract description with multiple fallback selectors
   */
  private extractDescription($: cheerio.CheerioAPI): string {
    const selectors = [
      "#J-rich-text-description",
      ".product-description",
      ".detail-description",
      "[class*='description']",
      'meta[property="og:description"]',
      'meta[name="description"]',
    ];

    for (const selector of selectors) {
      try {
        if (selector.startsWith('meta')) {
          const content = $(selector).attr('content');
          if (content && content.trim()) {
            return content.trim();
          }
        } else {
          const html = $(selector).first().html();
          if (html && html.trim()) {
            return html.trim();
          }
          const text = $(selector).first().text().trim();
          if (text && text.length > 10) {
            return text;
          }
        }
      } catch {
        // Continue
      }
    }

    return "";
  }

  /**
   * Extract specs with multiple fallback selectors
   */
  private extractSpecs($: cheerio.CheerioAPI): Record<string, string> {
    const specs: Record<string, string> = {};

    // Try multiple spec selectors
    const specSelectors = [
      ".do-entry-list li",
      ".spec-list li",
      ".product-specs li",
      "[class*='spec'] li",
      ".attributes li",
      "table.specs tr",
    ];

    for (const selector of specSelectors) {
      try {
        $(selector).each((_, el) => {
          let key = "";
          let value = "";

          // Try different key/value extraction methods
          if (selector.includes('table')) {
            key = $(el).find('td').first().text().trim();
            value = $(el).find('td').last().text().trim();
          } else {
            key = $(el).find(".do-entry-item, .spec-key, .spec-name, [class*='key']").first().text().trim();
            value = $(el).find(".do-entry-value, .spec-value, .spec-val, [class*='value']").first().text().trim();
            
            // If no specific key/value elements, try splitting by colon
            if (!key || !value) {
              const text = $(el).text().trim();
              const colonIndex = text.indexOf(':');
              if (colonIndex > 0) {
                key = text.substring(0, colonIndex).trim();
                value = text.substring(colonIndex + 1).trim();
              }
            }
          }

          if (key && value && key.length < 100 && value.length < 500) {
            specs[key] = value;
          }
        });
      } catch {
        // Continue to next selector
      }
    }

    return specs;
  }

  /**
   * Extract MOQ from HTML
   */
  private extractMoqFromHtml($: cheerio.CheerioAPI): number | null {
    const moqSelectors = [
      '[class*="moq"]',
      '[class*="MOQ"]',
      '[class*="min"]',
      '[data-moq]',
      '[data-min-order]',
    ];

    for (const selector of moqSelectors) {
      try {
        // Try data attribute first
        if (selector.includes('data-')) {
          const moqValue = $(selector).first().attr(selector.replace('[', '').replace(']', ''));
          if (moqValue) {
            const moq = parseInt(moqValue);
            if (!isNaN(moq) && moq > 0) {
              return moq;
            }
          }
        }

        // Try text content
        const text = $(selector).first().text();
        if (text) {
          const moq = this.extractMoq(text);
          if (moq) {
            return moq;
          }
        }
      } catch {
        // Continue
      }
    }

    return null;
  }

  /**
   * Extract shipping estimate
   */
  private extractShipping($: cheerio.CheerioAPI): string {
    const shippingSelectors = [
      ".trade-detail-main-wrap .module-pc-ship .text",
      '[class*="shipping"]',
      '[class*="delivery"]',
      '[class*="ship"]',
    ];

    for (const selector of shippingSelectors) {
      try {
        const text = $(selector).first().text().trim();
        if (text && text.length > 0) {
          return text;
        }
      } catch {
        // Continue
      }
    }

    return "";
  }

  /**
   * Check if URL is a valid image URL
   */
  private isValidImageUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.toLowerCase();
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
      return imageExtensions.some(ext => path.endsWith(ext)) || 
             url.includes('image') || 
             url.includes('img') ||
             url.includes('photo') ||
             url.includes('picture');
    } catch {
      return false;
    }
  }

  /**
   * Helper methods for data extraction
   */
  private extractImagesFromJsonLd(json: any): string[] {
    const images: string[] = [];
    if (json.image) {
      const imageArray = Array.isArray(json.image) ? json.image : [json.image];
      imageArray.forEach((img: any) => {
        const url = typeof img === 'string' ? img : (img.url || img['@id'] || img.contentUrl);
        if (url && url.startsWith('http')) {
          images.push(url);
        }
      });
    }
    return images;
  }

  private extractPriceFromJsonLd(json: any): any {
    if (json.offers) {
      const offers = Array.isArray(json.offers) ? json.offers : [json.offers];
      if (offers.length > 0) {
        const offer = offers[0];
        if (offer.price) {
          const priceValue = typeof offer.price === 'string' 
            ? parseFloat(offer.price.replace(/[^0-9.]/g, ''))
            : offer.price;
          
          return {
            amount: priceValue,
            currency: offer.priceCurrency || "USD",
          };
        }
      }
    }
    return null;
  }

  private extractSpecsFromJsonLd(json: any): Record<string, string> {
    const specs: Record<string, string> = {};
    if (json.additionalProperty && Array.isArray(json.additionalProperty)) {
      json.additionalProperty.forEach((prop: any) => {
        if (prop.name && prop.value) {
          specs[prop.name] = prop.value;
        }
      });
    }
    return specs;
  }

  private extractVariantsFromJsonLd(json: any): ProductVariant[] {
    const variants: ProductVariant[] = [];
    if (json.offers && Array.isArray(json.offers) && json.offers.length > 1) {
      json.offers.forEach((offer: any) => {
        variants.push({
          name: offer.name || "Variant",
          price: typeof offer.price === 'string' 
            ? parseFloat(offer.price.replace(/[^0-9.]/g, ''))
            : (offer.price || 0),
          attributes: {},
          image: offer.image,
        });
      });
    }
    return variants;
  }

  private extractMoqFromJsonLd(json: any): number | null {
    if (json.offers && Array.isArray(json.offers)) {
      for (const offer of json.offers) {
        if (offer.eligibleQuantity) {
          const minValue = offer.eligibleQuantity.minValue;
          if (minValue) {
            return parseInt(String(minValue));
          }
        }
      }
    }
    return null;
  }

  private extractImagesFromNested(json: any): string[] {
    const images: string[] = [];
    const imageFields = ['images', 'imageList', 'gallery', 'productImages', 'thumbnails'];
    
    for (const field of imageFields) {
      if (json[field]) {
        const imgArray = Array.isArray(json[field]) ? json[field] : [json[field]];
        imgArray.forEach((img: any) => {
          const url = typeof img === 'string' ? img : (img.url || img.src || img.original || img.thumbnail);
          if (url && url.startsWith('http')) {
            images.push(url);
          }
        });
        if (images.length > 0) break;
      }
    }
    
    return images;
  }

  private extractPriceFromNested(json: any): any {
    const priceFields = ['price', 'productPrice', 'unitPrice', 'salePrice', 'priceRange'];
    
    for (const field of priceFields) {
      if (json[field]) {
        if (typeof json[field] === 'number') {
          return { amount: json[field], currency: json.currency || "USD" };
        } else if (typeof json[field] === 'object') {
          return {
            fromPrice: json[field].from || json[field].min || json[field].fromPrice,
            toPrice: json[field].to || json[field].max || json[field].toPrice,
            amount: json[field].from || json[field].min || json[field].fromPrice || json[field].amount,
            currency: json[field].currency || json.currency || "USD",
          };
        } else if (typeof json[field] === 'string') {
          return this.parsePriceRange(json[field]);
        }
      }
    }
    
    return null;
  }

  private extractVariantsFromNested(json: any): ProductVariant[] {
    const variants: ProductVariant[] = [];
    const variantFields = ['variants', 'options', 'skuList', 'productOptions'];
    
    for (const field of variantFields) {
      if (json[field] && Array.isArray(json[field])) {
        json[field].forEach((variant: any) => {
          variants.push({
            name: variant.name || variant.label || variant.title || "Variant",
            price: variant.price || variant.unitPrice || 0,
            attributes: variant.attributes || variant.specs || {},
            image: variant.image || variant.thumbnail,
            stock: variant.stock || variant.quantity || 0,
          });
        });
        if (variants.length > 0) break;
      }
    }
    
    return variants;
  }

  private parsePriceRange(priceText: string): any {
    if (!priceText) return null;
    
    // Try to extract price range (e.g., "$10.00 - $20.00" or "USD 10-20")
    const rangeMatch = priceText.match(/(?:USD|US\$|\$)?\s*([\d,]+\.?\d*)\s*[-–—]\s*(?:USD|US\$|\$)?\s*([\d,]+\.?\d*)/i);
    if (rangeMatch) {
      const fromPrice = parseFloat(rangeMatch[1].replace(/,/g, ''));
      const toPrice = parseFloat(rangeMatch[2].replace(/,/g, ''));
      return {
        fromPrice,
        toPrice,
        amount: fromPrice, // Use lowest price as default
        currency: "USD",
      };
    }
    
    // Try single price
    const singleMatch = priceText.match(/(?:USD|US\$|\$)?\s*([\d,]+\.?\d*)/i);
    if (singleMatch) {
      return {
        amount: parseFloat(singleMatch[1].replace(/,/g, '')),
        currency: "USD",
      };
    }
    
    return null;
  }

  private extractMoq(text: string): number | null {
    if (!text) return null;
    const moqMatch = text.match(/(?:MOQ|Min\.?\s*Order|Minimum)\s*:?\s*(\d+)/i);
    if (moqMatch) {
      return parseInt(moqMatch[1]);
    }
    return null;
  }

  private hasEnoughData(data: any): boolean {
    if (!data) return false;
    // Need at least title or name
    return !!(data.title || data.name);
  }

  private mergeProductData(existing: any, newData: any): any {
    if (!existing) return newData;
    if (!newData) return existing;
    
    return {
      title: newData.title || existing.title,
      description: newData.description || existing.description,
      images: [...(existing.images || []), ...(newData.images || [])].filter((v, i, a) => a.indexOf(v) === i), // Unique
      price: newData.price || existing.price,
      variants: newData.variants || existing.variants,
      specs: { ...(existing.specs || {}), ...(newData.specs || {}) },
      moq: newData.moq || existing.moq,
      shippingEstimate: newData.shippingEstimate || existing.shippingEstimate,
      metadata: {
        ...(existing.metadata || {}),
        ...(newData.metadata || {}),
      },
      warnings: [...(existing.warnings || []), ...(newData.warnings || [])],
    };
  }
}

