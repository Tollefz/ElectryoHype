// Note: We don't import Page or use Puppeteer for Temu anymore - only URL-based extraction
import { BaseScraper } from "./base-scraper";
import type { ScraperResult, ProductVariant } from "./types";

export class TemuScraper extends BaseScraper {
  async scrapeProduct(url: string): Promise<ScraperResult> {
    try {
      // ALWAYS use URL-based extraction for Temu (Puppeteer causes issues)
      // Extract data from URL parameters (fast, reliable, no browser needed)
      const urlData = this.extractFromUrl(url);
      
      // Build result directly from URL data (skip Puppeteer completely)
      const result = {
        supplier: "temu" as const,
        url,
        images: urlData.images.length > 0 ? urlData.images : [],
        title: urlData.title || this.decodeTitleFromUrl(url) || "Temu Produkt",
        price: urlData.price.amount > 0 ? urlData.price : { amount: 9.99, currency: "USD" as const },
        description: urlData.description || "",
        variants: urlData.variants || undefined,
        specs: {},
        availability: true,
      };
      
      // Ensure title is valid
      if (!result.title || result.title === "Temu product") {
        result.title = this.decodeTitleFromUrl(url) || "Temu Produkt";
      }
      
      return this.toResult(result);
    } catch (error) {
      // Even if everything fails, try to return URL-based data
      try {
        const urlData = this.extractFromUrl(url);
        return this.toResult({
          supplier: "temu",
          url,
          title: this.decodeTitleFromUrl(url) || "Temu Produkt",
          description: urlData.description || "",
          price: urlData.price.amount > 0 ? urlData.price : { amount: 9.99, currency: "USD" },
          images: urlData.images,
          variants: urlData.variants,
          specs: {},
          availability: true,
        });
      } catch (fallbackError) {
        return this.failure(error);
      }
    }
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
   */
  private extractFromUrl(url: string) {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    
    const title = this.extractTitleFromUrl(url);
    
    // Extract main image from URL parameter
    const topGalleryUrl = params.get("top_gallery_url");
    const images: string[] = [];
    if (topGalleryUrl) {
      try {
        const decodedUrl = decodeURIComponent(topGalleryUrl);
        if (decodedUrl.startsWith('http')) {
          images.push(decodedUrl);
        }
      } catch {
        // If decoding fails, try to use as-is
        if (topGalleryUrl.startsWith('http')) {
          images.push(topGalleryUrl);
        }
      }
    }
    
    // Try to extract additional images from URL path
    const pathParts = urlObj.pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1] || '';
    
    // Check if there's a product ID that can be used
    const productIdMatch = lastPart.match(/g-(\d+)/);
    if (productIdMatch && productIdMatch[1] && images.length === 0) {
      const productId = productIdMatch[1];
      // Try common Temu image URL patterns (may not always work, but worth trying)
      const possibleImageUrl = `https://img.kwcdn.com/product/${productId}.jpg`;
      images.push(possibleImageUrl);
    }
    
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
    
    // Extract variants info from URL if present
    const variants: Array<{
      name: string;
      price: number;
      attributes: Record<string, string>;
    }> = [];
    
    // Check if URL mentions color options or variants
    const colorMatch = url.match(/3-color-options|([\w\-]+)-color|color.*options/i);
    const hasVariants = url.includes('variant') || url.includes('option') || colorMatch;
    
    if (hasVariants) {
      // Create a standard variant as starting point
      variants.push({
        name: "Standard",
        price: price.amount,
        attributes: {},
      });
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
}

