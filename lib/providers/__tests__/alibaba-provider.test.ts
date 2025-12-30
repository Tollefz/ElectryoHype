import { describe, it, expect, beforeEach, vi } from "vitest";
import { AlibabaProvider } from "../alibaba-provider";
import * as cheerio from "cheerio";
import { readFileSync } from "fs";
import { join } from "path";
import axios from "axios";

// Mock axios
vi.mock("axios");
const mockedAxios = axios as any;

// Helper to load HTML fixture
function loadFixture(filename: string): string {
  const fixturePath = join(__dirname, "fixtures", filename);
  return readFileSync(fixturePath, "utf-8");
}

describe("AlibabaProvider", () => {
  let provider: AlibabaProvider;

  beforeEach(() => {
    provider = new AlibabaProvider();
  });

  describe("getName", () => {
    it("should return 'alibaba'", () => {
      expect(provider.getName()).toBe("alibaba");
    });
  });

  describe("canHandle", () => {
    it("should return true for alibaba.com URLs with product-detail", () => {
      expect(provider.canHandle("https://www.alibaba.com/product-detail/123456789.html")).toBe(true);
      expect(provider.canHandle("https://alibaba.com/product-detail/123.html")).toBe(true);
    });

    it("should return true for 1688.com URLs with product-detail", () => {
      expect(provider.canHandle("https://www.1688.com/product-detail/123.html")).toBe(true);
    });

    it("should return true for Alibaba URLs even without product-detail", () => {
      // canHandle only checks hostname, not path (best effort)
      expect(provider.canHandle("https://www.alibaba.com/product.html")).toBe(true);
    });

    it("should return false for non-Alibaba URLs", () => {
      expect(provider.canHandle("https://www.temu.com/product.html")).toBe(false);
      expect(provider.canHandle("https://www.example.com")).toBe(false);
    });
  });

  describe("normalizeUrl", () => {
    it("should use shared URL normalization utility", () => {
      const url = "https://www.alibaba.com/product-detail/123.html?utm_source=google&spm=abc&ref=123";
      const normalized = provider.normalizeUrl(url);
      
      expect(normalized).not.toContain("utm_source");
      expect(normalized).not.toContain("spm");
      expect(normalized).not.toContain("ref");
      expect(normalized).toContain("product-detail/123.html");
    });

    it("should normalize domain to www.alibaba.com", () => {
      const url = "https://alibaba.com/product-detail/123.html";
      const normalized = provider.normalizeUrl(url);
      
      expect(normalized).toContain("www.alibaba.com");
    });

    it("should normalize protocol to https", () => {
      const url = "http://www.alibaba.com/product-detail/123.html";
      const normalized = provider.normalizeUrl(url);
      
      expect(normalized).toMatch(/^https:/);
    });

    it("should trim whitespace", () => {
      const url = "  https://www.alibaba.com/product-detail/123.html  ";
      const normalized = provider.normalizeUrl(url);
      
      expect(normalized).not.toMatch(/^\s/);
      expect(normalized).not.toMatch(/\s$/);
    });
  });

  describe("extractFromJsonLd", () => {
    it("should extract product data from JSON-LD schema", () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Test Product",
                "description": "Test Description",
                "image": ["https://example.com/image1.jpg", "https://example.com/image2.jpg"],
                "offers": {
                  "@type": "Offer",
                  "price": "19.99",
                  "priceCurrency": "USD"
                },
                "additionalProperty": [
                  {"name": "Color", "value": "Red"},
                  {"name": "Size", "value": "Large"}
                ]
              }
            </script>
          </head>
          <body></body>
        </html>
      `;

      const $ = cheerio.load(html);
      const productData = (provider as any).extractFromJsonLd($);

      expect(productData).toBeTruthy();
      expect(productData.title).toBe("Test Product");
      expect(productData.description).toBe("Test Description");
      expect(productData.images).toHaveLength(2);
      expect(productData.price.amount).toBe(19.99);
      expect(productData.price.currency).toBe("USD");
      expect(productData.specs.Color).toBe("Red");
      expect(productData.specs.Size).toBe("Large");
    });

    it("should extract product data from HTML fixture", () => {
      const html = loadFixture("alibaba-product-sample.html");
      const $ = cheerio.load(html);
      const productData = (provider as any).extractFromJsonLd($);

      expect(productData).toBeTruthy();
      expect(productData.title).toBe("Wireless Bluetooth Headphones");
      expect(productData.description).toContain("High-quality wireless Bluetooth headphones");
      expect(productData.images.length).toBeGreaterThan(0);
      expect(productData.price.amount).toBe(15.99);
      expect(productData.price.currency).toBe("USD");
      expect(productData.variants.length).toBeGreaterThan(0);
      expect(productData.moq).toBe(10);
      expect(productData.specs.Color).toBe("Black");
    });

    it("should handle price ranges in JSON-LD", () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Test Product",
                "offers": [
                  {
                    "@type": "Offer",
                    "price": "10.00",
                    "priceCurrency": "USD",
                    "eligibleQuantity": {"minValue": 1}
                  },
                  {
                    "@type": "Offer",
                    "price": "20.00",
                    "priceCurrency": "USD"
                  }
                ]
              }
            </script>
          </head>
          <body></body>
        </html>
      `;

      const $ = cheerio.load(html);
      const productData = (provider as any).extractFromJsonLd($);

      expect(productData).toBeTruthy();
      expect(productData.price.amount).toBe(10.00);
      expect(productData.variants).toHaveLength(2);
      expect(productData.moq).toBe(1);
    });
  });

  describe("parsePriceRange", () => {
    it("should parse price range", () => {
      const priceText = "$10.00 - $20.00";
      const price = (provider as any).parsePriceRange(priceText);

      expect(price).toBeTruthy();
      expect(price.fromPrice).toBe(10);
      expect(price.toPrice).toBe(20);
      expect(price.amount).toBe(10); // Lowest price
    });

    it("should parse single price", () => {
      const priceText = "USD 15.50";
      const price = (provider as any).parsePriceRange(priceText);

      expect(price).toBeTruthy();
      expect(price.amount).toBe(15.50);
    });

    it("should handle prices with commas", () => {
      const priceText = "$1,000.00 - $2,000.00";
      const price = (provider as any).parsePriceRange(priceText);

      expect(price).toBeTruthy();
      expect(price.fromPrice).toBe(1000);
      expect(price.toPrice).toBe(2000);
    });
  });

  describe("extractMoq", () => {
    it("should extract MOQ from text", () => {
      expect((provider as any).extractMoq("MOQ: 100")).toBe(100);
      expect((provider as any).extractMoq("Min. Order: 50")).toBe(50);
      expect((provider as any).extractMoq("Minimum Order Quantity: 200")).toBe(200);
    });

    it("should return null if no MOQ found", () => {
      expect((provider as any).extractMoq("No MOQ here")).toBeNull();
    });
  });

  describe("HTML fallback parsing", () => {
    it("should extract product data from HTML when JSON-LD is missing", () => {
      const html = loadFixture("alibaba-product-html-only.html");
      const $ = cheerio.load(html);
      const productData = (provider as any).extractFromHtml($, "https://example.com/product.html");

      expect(productData).toBeTruthy();
      expect(productData.title).toBe("Wireless Bluetooth Headphones Pro");
      expect(productData.images.length).toBeGreaterThan(0);
      expect(productData.price).toBeTruthy();
      expect(productData.price.fromPrice).toBe(12.99);
      expect(productData.price.toPrice).toBe(18.99);
      expect(productData.specs.Color).toBe("Black");
      expect(productData.moq).toBe(20);
      expect(productData.shippingEstimate).toContain("5-10 business days");
    });

    it("should extract title with multiple fallback selectors", () => {
      const html = `
        <html>
          <body>
            <h1 class="product-title">Test Product Title</h1>
          </body>
        </html>
      `;
      const $ = cheerio.load(html);
      const title = (provider as any).extractTitle($);
      expect(title).toBe("Test Product Title");
    });

    it("should extract images with multiple fallback selectors", () => {
      const html = `
        <html>
          <body>
            <div class="gallery">
              <img src="https://example.com/img1.jpg">
              <img data-src="https://example.com/img2.jpg">
            </div>
          </body>
        </html>
      `;
      const $ = cheerio.load(html);
      const images = (provider as any).extractImages($, "https://example.com/");
      expect(images.length).toBeGreaterThan(0);
      expect(images.some((img: string) => img.includes("img1.jpg"))).toBe(true);
    });

    it("should extract price with multiple fallback selectors", () => {
      const html = `
        <html>
          <body>
            <div class="product-price">USD $15.50 - $25.00</div>
          </body>
        </html>
      `;
      const $ = cheerio.load(html);
      const price = (provider as any).extractPrice($);
      expect(price).toBeTruthy();
      expect(price.fromPrice).toBe(15.50);
      expect(price.toPrice).toBe(25.00);
    });
  });

  describe("mapToProduct", () => {
    it("should map raw product data to MappedProduct format", () => {
      const rawProduct = {
        title: "Test Product",
        description: "Test Description",
        images: ["https://example.com/image1.jpg"],
        price: { amount: 19.99, currency: "USD" },
        specs: { Color: "Red" },
        moq: 10,
      };

      const mapped = provider.mapToProduct(rawProduct as any, "https://example.com/product.html");

      expect(mapped.supplier).toBe("alibaba");
      expect(mapped.title).toBe("Test Product");
      expect(mapped.description).toBe("Test Description");
      expect(mapped.images).toHaveLength(1);
      expect(mapped.price.amount).toBe(19.99);
      expect(mapped.price.currency).toBe("USD");
      expect(mapped.specs.MOQ).toBe("10");
      expect(mapped.variants).toHaveLength(1); // Default variant
    });

    it("should handle price intervals", () => {
      const rawProduct = {
        title: "Test Product",
        price: { fromPrice: 10, toPrice: 20, amount: 10, currency: "USD" },
        metadata: { priceRange: { fromPrice: 10, toPrice: 20 } },
      };

      const mapped = provider.mapToProduct(rawProduct as any, "https://example.com/product.html");

      expect(mapped.price.amount).toBe(10);
      expect(mapped.specs.Prisintervall).toBe("10 - 20 USD");
    });
  });

  describe("fetchProduct with HTML fallback", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should use HTML fallback when JSON-LD is missing", async () => {
      const html = loadFixture("alibaba-product-html-only.html");
      
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: html,
      });

      const rawProduct = await provider.fetchProduct("https://www.alibaba.com/product-detail/123.html");

      expect(rawProduct).toBeTruthy();
      expect(rawProduct.title).toBe("Wireless Bluetooth Headphones Pro");
      expect(rawProduct.images).toBeTruthy();
      expect(rawProduct.images.length).toBeGreaterThan(0);
      expect(rawProduct.price).toBeTruthy();
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("should merge HTML data when structured data is incomplete", async () => {
      // HTML with partial JSON-LD (missing images)
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Test Product",
                "offers": {
                  "@type": "Offer",
                  "price": "19.99",
                  "priceCurrency": "USD"
                }
              }
            </script>
          </head>
          <body>
            <div class="product-image-gallery">
              <img src="https://example.com/image1.jpg">
              <img src="https://example.com/image2.jpg">
            </div>
          </body>
        </html>
      `;

      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: html,
      });

      const rawProduct = await provider.fetchProduct("https://www.alibaba.com/product-detail/123.html");

      expect(rawProduct).toBeTruthy();
      expect(rawProduct.title).toBe("Test Product");
      // Images should be filled from HTML fallback
      expect(rawProduct.images).toBeTruthy();
      expect(rawProduct.images.length).toBeGreaterThan(0);
    });

    it("should retry on network errors", async () => {
      mockedAxios.get
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          status: 200,
          data: loadFixture("alibaba-product-html-only.html"),
        });

      const rawProduct = await provider.fetchProduct("https://www.alibaba.com/product-detail/123.html");

      expect(rawProduct).toBeTruthy();
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it("should create default variant if none provided", () => {
      const rawProduct = {
        title: "Test Product",
        price: { amount: 19.99, currency: "USD" },
      };

      const mapped = provider.mapToProduct(rawProduct as any, "https://example.com/product.html");

      expect(mapped.variants).toHaveLength(1);
      expect(mapped.variants[0].name).toBe("Standard");
      expect(mapped.variants[0].price).toBe(19.99);
    });
  });
});

