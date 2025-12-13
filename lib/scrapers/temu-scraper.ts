// Note: We don't import Page or use Puppeteer for Temu anymore
// We use axios + cheerio for HTML scraping instead
import axios from "axios";
import * as cheerio from "cheerio";
import type { ScraperResult, ProductVariant, ScrapedProductData, Scraper } from "./types";

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
      const allImages = [
        ...urlData.images,
        ...(htmlData.images || [])
      ].filter((img, index, self) => self.indexOf(img) === index); // Remove duplicates
      
      console.log(`[TemuScraper] Combined ${urlData.images.length} URL images + ${htmlData.images?.length || 0} HTML images = ${allImages.length} total`);
      
      // Prioritize HTML variants, fall back to URL variants, or create default variant
      let variants = htmlData.variants && htmlData.variants.length > 0 
        ? htmlData.variants 
        : urlData.variants;
      
      // CRITICAL: If no variants found, create at least one default variant
      // This ensures the product always has at least one variant for proper saving
      if (!variants || variants.length === 0) {
        console.log(`[TemuScraper] ⚠️ No variants found, creating default variant`);
        variants = [{
          name: "Standard",
          price: urlData.price.amount > 0 ? urlData.price.amount : 9.99,
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
            price: typeof v.price === 'number' && v.price > 0 ? v.price : (urlData.price.amount > 0 ? urlData.price.amount : 9.99),
            attributes: v.attributes || {},
            image: variantImage,
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
        price: urlData.price.amount > 0 ? urlData.price : { amount: 9.99, currency: "USD" as const },
        description: htmlData.description || urlData.description || "",
        variants: variants, // Always include variants (at least one default)
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
              price: urlData.price.amount > 0 ? urlData.price.amount : 9.99,
              attributes: {},
              image: urlData.images.length > 0 ? urlData.images[0] : undefined,
            }];
        
        return this.toResult({
          supplier: "temu",
          url,
          title: this.decodeTitleFromUrl(url) || "Temu Produkt",
          description: urlData.description || "",
          price: urlData.price.amount > 0 ? urlData.price : { amount: 9.99, currency: "USD" },
          images: urlData.images,
          variants: fallbackVariants,
          specs: {},
          availability: true,
        });
      } catch (fallbackError) {
        // Last resort: return minimal product with default variant
        return this.toResult({
          supplier: "temu",
          url,
          title: this.decodeTitleFromUrl(url) || "Temu Produkt",
          description: "",
          price: { amount: 9.99, currency: "USD" },
          images: [],
          variants: [{
            name: "Standard",
            price: 9.99,
            attributes: {},
          }],
          specs: {},
          availability: true,
        });
      }
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
        
        // Format title
        const formatted = decoded
          .split('-')
          .filter(word => !word.match(/^\d+$/)) // Remove pure numbers
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
    const productIdMatch = lastPart.match(/g-(\d+)/);
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
    
    // Try to extract price from URL (sometimes in referral parameters)
    // Default to a reasonable price if not found
    let price = { amount: 9.99, currency: "USD" as const };
    const priceMatch = url.match(/[_\-](\d+)[\-_]kr/i) || url.match(/price[=_](\d+)/i);
    if (priceMatch) {
      const priceAmount = parseFloat(priceMatch[1]);
      if (priceAmount > 0 && priceAmount < 10000) {
        price.amount = priceAmount / 10.5; // Convert NOK to USD estimate
      }
    }
    
    // Extract variants - try API first, then fallback to URL parsing
    let variants: Array<{
      name: string;
      price: number;
      attributes: Record<string, string>;
      image?: string;
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
      
      // ELECTROHYPEX POLICY: Only create BLACK/SVART variants
      // Filter to only black colors
      const blackColors = foundColors.filter(color => {
        const normalized = color.toLowerCase();
        return normalized === 'svart' || normalized === 'black' || normalized === 'sort';
      });
      
      // If we found black color keywords, create only black variant
      if (blackColors.length > 0) {
        console.log(`[TemuScraper] Detected black color from text: ${blackColors.join(', ')}`);
        const color = 'Svart'; // Always use "Svart" as the standard black color name
        
        // Try to find image that matches black keyword
        let variantImage: string | undefined = undefined;
        
        if (images.length > 0) {
          const blackKeywords = ['black', 'svart', 'dark', 'sort'];
          const matchingImage = images.find(img => {
            const imgLower = img.toLowerCase();
            return blackKeywords.some(keyword => imgLower.includes(keyword));
          });
          
          variantImage = matchingImage || images[0]; // Use first image if no black-specific image found
        }
        
        variants.push({
          name: color,
          price: price.amount,
          attributes: { color: color, farge: color },
          image: variantImage,
        });
        
        console.log(`[TemuScraper] Created BLACK variant "${color}" with image: ${variantImage ? variantImage.substring(0, 60) + '...' : 'none'}`);
      } else if (foundColors.length > 0) {
        // Found colors but none are black - create a single black variant anyway
        // This ensures products always have at least one variant
        console.log(`[TemuScraper] Detected colors but none are black: ${foundColors.join(', ')}. Creating single black variant instead.`);
        const color = 'Svart';
        
        let variantImage: string | undefined = undefined;
        if (images.length > 0) {
          variantImage = images[0];
        }
        
        variants.push({
          name: color,
          price: price.amount,
          attributes: { color: color, farge: color },
          image: variantImage,
        });
        
        console.log(`[TemuScraper] Created BLACK variant "${color}" (default) with image: ${variantImage ? variantImage.substring(0, 60) + '...' : 'none'}`);
      } else {
        // Even if no colors detected, check if this looks like it should have variants
        // Many Temu products have variants even if not mentioned in URL/title
        // Check for bundle mentions or other indicators
        const bundleMatch = allText.match(/bundle|pakke|sett|multi|universal/i);
        const hasNumbers = allText.match(/\d+\s*(pack|stk|stykker|pieces|pcs)/i);
        const isBracket = allText.includes('bracket') || allText.includes('brakett') || allText.includes('stand') || allText.includes('stativ');
        const isHolder = allText.includes('holder') || allText.includes('holder');
        
        // If product seems like it could have variants, create some common ones
        // For phone/tablet brackets/holders, common variants are different colors
        if (bundleMatch || hasNumbers || isBracket || isHolder) {
          console.log(`[TemuScraper] Product seems to support variants (${isBracket ? 'bracket' : bundleMatch ? 'bundle' : 'has numbers'}), creating common color options`);
          
          // For brackets/holders, common variants include more colors
          // Check if product might have additional variants based on URL/title hints
          const hasMultipleColors = allText.match(/multi.*color|several.*color|various.*color|3.*color|4.*color|5.*color/i);
          const hasSizeMention = allText.match(/small|medium|large|xl|xs|size/i);
          
          // ELECTROHYPEX POLICY: Only create BLACK variant
          // Regardless of product type, we only create a single black variant
          let commonColors = ['Svart'];
          
          console.log(`[TemuScraper] Creating single BLACK variant (ElectroHypeX policy: only black colors)`);
          
          // Map colors to numbers for variant image generation (used in multiple strategies)
          const colorIndexMap: Record<string, number> = {
            'Svart': 1,
            'Hvit': 2,
            'Grå': 3,
            'Rød': 4,
            'Blå': 5,
            'Grønn': 6,
            'Gul': 7,
            'Rosa': 8,
            'Lilla': 9,
            'Sølv': 10,
          };
          
          // ELECTROHYPEX: Only create one black variant
          // Generate variant image - use first available image
          const color = 'Svart';
          let variantImage: string | undefined = undefined;
          
          // Use first available image
          if (images.length > 0) {
            variantImage = images[0];
          }
          
          // Try to generate variant-specific image if productId and spec_gallery_id exist
          if (variantImage && productId && specGalleryId) {
            const colorIndex = colorIndexMap[color] || 1;
            const variantGalleryId = parseInt(specGalleryId) + colorIndex - 1;
            
            if (images.length > 0) {
              const baseImage = images[0];
              // Try to extract the base path and construct variant URL
              const variantImageUrl = baseImage.replace(
                /\/spec_gallery_id=\d+/,
                `/spec_gallery_id=${variantGalleryId}`
              ).replace(
                /g-(\d+)/,
                `g-${productId}`
              );
              
              variantImage = variantImageUrl;
              console.log(`[TemuScraper] Generated variant image URL for ${color} (gallery ${variantGalleryId}): ${variantImageUrl.substring(0, 80)}...`);
            }
          }
          
          variants.push({
            name: color,
            price: price.amount,
            attributes: { color: color, farge: color },
            image: variantImage,
          });
          
          console.log(`[TemuScraper] Created BLACK variant "${color}" with image: ${variantImage ? 'Yes' : 'No'}`);
        } else {
          // Default: create at least one BLACK variant (ElectroHypeX policy)
          variants.push({
            name: "Svart",
            price: price.amount,
            attributes: { color: 'Svart', farge: 'Svart' },
            image: images.length > 0 ? images[0] : undefined,
          });
          console.log(`[TemuScraper] Created default BLACK variant "Svart"`);
        }
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
              
              const variants = skuList.map((sku: any) => {
                // Extract variant name from specList
                let variantName = 'Standard';
                const attributes: Record<string, string> = {};
                
                if (sku.specList && Array.isArray(sku.specList)) {
                  sku.specList.forEach((spec: any) => {
                    const specName = (spec.specName || spec.name || spec.specKey || '').toLowerCase();
                    const specValue = spec.specValue || spec.value || spec.specVal || '';
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
                const variantImage = sku.thumbUrl || sku.image || sku.imgUrl || sku.goodsImg || 
                                   sku.imageUrl || sku.thumb || sku.img || 
                                   (sku.gallery && sku.gallery[0]) ||
                                   (sku.images && sku.images[0]);
                
                const price = parseFloat(sku.goodsPrice || sku.salePrice || sku.price || sku.minPrice || '9.99');
                
                console.log(`[TemuScraper] Variant: ${variantName}, Price: ${price}, Image: ${variantImage ? 'Yes' : 'No'}`);
                
                return {
                  name: variantName,
                  price: price > 0 ? price : 9.99,
                  attributes,
                  image: variantImage && variantImage.startsWith('http') ? variantImage : undefined,
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
          
          return decoded
            .split("-")
            .filter(word => !word.match(/^\d+$/)) // Remove pure numbers
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
      let productData: any = null;
      const scriptTags = $('script');
      
      scriptTags.each((_, el) => {
        const scriptContent = $(el).html() || '';
        
        // Look for window.__NEXT_DATA__ or similar structures
        if (scriptContent.includes('__NEXT_DATA__') || scriptContent.includes('window.__INITIAL_STATE__') || scriptContent.includes('productData') || scriptContent.includes('goodsDetail')) {
          try {
            // Extract JSON from various patterns
            let jsonData = null;
            
            // Pattern 1: window.__NEXT_DATA__ = {...}
            const nextDataMatch = scriptContent.match(/window\.__NEXT_DATA__\s*=\s*({[\s\S]*?});/);
            if (nextDataMatch) {
              jsonData = JSON.parse(nextDataMatch[1]);
              productData = jsonData?.props?.pageProps?.initialState?.goodsDetail || 
                           jsonData?.props?.pageProps?.goodsDetail ||
                           jsonData?.props?.pageProps?.product ||
                           jsonData?.product;
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
                    productData = jsonData.variants || jsonData.skus || jsonData.goodsDetail || jsonData.product;
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
      });
      
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
          const variantList = productData.skus || 
                            productData.variants || 
                            productData.goodsSkuList ||
                            productData.goodsSku ||
                            productData.skuInfo ||
                            productData.skuList ||
                            (productData.skuList ? Object.values(productData.skuList) : null) ||
                            (productData.detail?.skus ? productData.detail.skus : null) ||
                            (productData.detail?.goodsSkuList ? productData.detail.goodsSkuList : null) ||
                            (productData.productInfo?.skus ? productData.productInfo.skus : null);
          
          // If variantList is not an array but an object, try to convert it
          let variantsArray: any[] = [];
          if (variantList) {
            if (Array.isArray(variantList)) {
              variantsArray = variantList;
            } else if (typeof variantList === 'object') {
              // Try to extract variants from object structure
              variantsArray = Object.values(variantList);
              // If that doesn't work, check if it's a nested structure
              if (variantsArray.length === 0 && variantList.list) {
                variantsArray = Array.isArray(variantList.list) ? variantList.list : [];
              }
            }
          }
          
          if (variantsArray.length > 0) {
            console.log(`✅ Found ${variantsArray.length} variants in product data`);
            
            variantsArray.forEach((variant: any, index: number) => {
              // Extract variant name (usually in specList or name property)
              let variantName = variant.name || variant.title || '';
              const attributes: Record<string, string> = {};
              
              // Extract attributes from specList or similar
              if (variant.specList && Array.isArray(variant.specList)) {
                variant.specList.forEach((spec: any) => {
                  const specName = spec.specName || spec.name || '';
                  const specValue = spec.specValue || spec.value || '';
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
              
              // Extract price
              const price = variant.salePrice || variant.price || variant.goodsPrice || 9.99;
              const priceAmount = typeof price === 'string' ? parseFloat(price.replace(/[^0-9.]/g, '')) : parseFloat(price);
              
              // Extract image
              const variantImage = variant.thumbUrl || variant.image || variant.imgUrl || variant.goodsImg || undefined;
              
              variants.push({
                name: variantName,
                price: priceAmount > 0 ? priceAmount : 9.99,
                attributes: attributes,
                image: variantImage && variantImage.startsWith('http') ? variantImage : undefined,
              });
            });
          }
          
          // Extract images from product data - try multiple sources
          const imageSources: any[] = [];
          
          // Try various image array properties
          if (productData.gallery) imageSources.push(productData.gallery);
          if (productData.images) imageSources.push(productData.images);
          if (productData.imgList) imageSources.push(productData.imgList);
          if (productData.goodsGallery) imageSources.push(productData.goodsGallery);
          if (productData.goodsImgList) imageSources.push(productData.goodsImgList);
          if (productData.productImages) imageSources.push(productData.productImages);
          
          // Also try nested paths
          if (productData.goodsInfo?.gallery) imageSources.push(productData.goodsInfo.gallery);
          if (productData.goodsInfo?.images) imageSources.push(productData.goodsInfo.images);
          if (productData.detail?.gallery) imageSources.push(productData.detail.gallery);
          if (productData.detail?.images) imageSources.push(productData.detail.images);
          
          // Extract images from variant data
          if (variantsArray && variantsArray.length > 0) {
            variantsArray.forEach((variant: any) => {
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
          imageSources.forEach((imageList: any) => {
            if (Array.isArray(imageList)) {
              imageList.forEach((img: any) => {
                const imgUrl = typeof img === 'string' 
                  ? img 
                  : (img.url || img.src || img.thumbUrl || img.imageUrl || img.original || '');
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
                json.offers.forEach((offer: any, index: number) => {
                  if (offer.availability === 'https://schema.org/InStock' || offer.availability === 'InStock') {
                    variants.push({
                      name: offer.name || `Variant ${index + 1}`,
                      price: offer.price ? parseFloat(offer.price) : 9.99,
                      attributes: {
                        color: offer.color || '',
                        size: offer.size || '',
                      },
                      image: offer.image || undefined,
                    });
                  }
                });
              }
              
              // Extract images
              if (json.image) {
                const productImages = Array.isArray(json.image) ? json.image : [json.image];
                productImages.forEach((img: any) => {
                  const imgUrl = typeof img === 'string' ? img : (img.url || img['@id'] || '');
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
                    const searchForVariants = (obj: any, depth = 0): any[] => {
                      if (depth > 5) return []; // Limit recursion
                      const found: any[] = [];
                      
                      if (obj && typeof obj === 'object') {
                        if (Array.isArray(obj)) {
                          obj.forEach(item => found.push(...searchForVariants(item, depth + 1)));
                        } else {
                          for (const [key, value] of Object.entries(obj)) {
                            const keyLower = key.toLowerCase();
                            if ((keyLower.includes('sku') || keyLower.includes('variant')) && Array.isArray(value)) {
                              found.push(...value);
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
                      foundVariants.forEach((v: any, idx: number) => {
                        if (v && typeof v === 'object') {
                          const name = v.name || v.title || v.specValue || v.color || `Variant ${idx + 1}`;
                          const price = parseFloat(v.price || v.salePrice || v.goodsPrice || '9.99');
                          variants.push({
                            name: String(name),
                            price: price > 0 ? price : 9.99,
                            attributes: v.specList ? Object.fromEntries(
                              (Array.isArray(v.specList) ? v.specList : []).map((s: any) => [
                                String(s.specName || s.name || '').toLowerCase(),
                                String(s.specValue || s.value || '')
                              ])
                            ) : (v.color ? { color: String(v.color) } : {}),
                            image: v.image || v.thumbUrl || v.imgUrl || undefined,
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
          const basePrice = 9.99;
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
              let variantText = $el.text().trim() || 
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
              const sku = $el.attr('data-sku') || $el.attr('data-variant');
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
                const findImages = (obj: any): string[] => {
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

