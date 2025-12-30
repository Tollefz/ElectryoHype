import { describe, it, expect } from "vitest";
import {
  normalizeUrl,
  isValidTemuUrl,
  isValidAlibabaUrl,
  isAlibabaProductUrl,
  validateAndNormalizeUrl,
  extractTemuParams,
  extractAlibabaProductId,
} from "../url-validation";

describe("URL Validation", () => {
  describe("normalizeUrl", () => {
    it("should trim whitespace", () => {
      const url = "  https://www.temu.com/goods.html  ";
      const normalized = normalizeUrl(url);
      
      expect(normalized).toBe("https://www.temu.com/goods.html");
    });

    it("should remove tracking parameters", () => {
      const url = "https://www.temu.com/goods.html?goods_id=123&utm_source=google&ref=abc&gclid=xyz";
      const normalized = normalizeUrl(url);
      
      expect(normalized).not.toContain("utm_source");
      expect(normalized).not.toContain("ref");
      expect(normalized).not.toContain("gclid");
      expect(normalized).toContain("goods_id=123");
    });

    it("should preserve essential Temu parameters", () => {
      const url = "https://www.temu.com/goods.html?goods_id=123&top_gallery_url=https://example.com/image.jpg&spec_gallery_id=456&utm_source=google";
      const normalized = normalizeUrl(url);
      
      expect(normalized).toContain("goods_id=123");
      expect(normalized).toContain("top_gallery_url");
      expect(normalized).toContain("spec_gallery_id=456");
      expect(normalized).not.toContain("utm_source");
    });

    it("should normalize protocol to https", () => {
      const url = "http://www.temu.com/goods.html";
      const normalized = normalizeUrl(url);
      
      expect(normalized).toMatch(/^https:/);
    });

    it("should add https:// if missing", () => {
      const url = "www.temu.com/goods.html";
      const normalized = normalizeUrl(url);
      
      expect(normalized).toMatch(/^https:/);
      expect(normalized).toContain("www.temu.com");
    });

    it("should normalize Temu domain to www.temu.com", () => {
      const url = "https://temu.com/goods.html";
      const normalized = normalizeUrl(url);
      
      expect(normalized).toContain("www.temu.com");
    });

    it("should normalize Alibaba domain to www.alibaba.com", () => {
      const url = "https://alibaba.com/product-detail/123.html";
      const normalized = normalizeUrl(url);
      
      expect(normalized).toContain("www.alibaba.com");
    });

    it("should handle URLs with large query strings", () => {
      const url = `https://www.temu.com/goods.html?goods_id=123&${Array(50).fill("param=value").join("&")}&utm_source=google`;
      const normalized = normalizeUrl(url);
      
      expect(normalized).not.toContain("utm_source");
      expect(normalized).toContain("goods_id=123");
    });

    it("should return original if URL parsing fails", () => {
      const invalidUrl = "not-a-valid-url";
      const normalized = normalizeUrl(invalidUrl);
      
      // Should return trimmed original
      expect(normalized).toBe("not-a-valid-url");
    });

    it("should handle empty string", () => {
      expect(normalizeUrl("")).toBe("");
      expect(normalizeUrl("   ")).toBe("");
    });

    it("should handle null/undefined", () => {
      expect(normalizeUrl(null as any)).toBe(null);
      expect(normalizeUrl(undefined as any)).toBe(undefined);
    });
  });

  describe("isValidTemuUrl", () => {
    it("should return true for valid Temu URLs", () => {
      expect(isValidTemuUrl("https://www.temu.com/goods.html")).toBe(true);
      expect(isValidTemuUrl("https://temu.com/product.html")).toBe(true);
      expect(isValidTemuUrl("https://www.temu.co.uk/goods.html")).toBe(true);
    });

    it("should return true for URLs without protocol", () => {
      expect(isValidTemuUrl("www.temu.com/goods.html")).toBe(true);
      expect(isValidTemuUrl("temu.com/product.html")).toBe(true);
    });

    it("should return false for non-Temu URLs", () => {
      expect(isValidTemuUrl("https://www.alibaba.com/product.html")).toBe(false);
      expect(isValidTemuUrl("https://www.example.com")).toBe(false);
    });

    it("should return false for invalid URLs", () => {
      expect(isValidTemuUrl("")).toBe(false);
      expect(isValidTemuUrl("not-a-url")).toBe(false);
    });

    it("should handle URLs with whitespace", () => {
      expect(isValidTemuUrl("  https://www.temu.com/goods.html  ")).toBe(true);
    });
  });

  describe("isValidAlibabaUrl", () => {
    it("should return true for valid Alibaba URLs with product-detail", () => {
      expect(isValidAlibabaUrl("https://www.alibaba.com/product-detail/123456789.html")).toBe(true);
      expect(isValidAlibabaUrl("https://www.alibaba.com/product-detail/123.html?spm=abc")).toBe(true);
    });

    it("should return true for 1688.com URLs", () => {
      expect(isValidAlibabaUrl("https://www.1688.com/product-detail/123.html")).toBe(true);
    });

    it("should return true for URLs without protocol", () => {
      expect(isValidAlibabaUrl("www.alibaba.com/product-detail/123.html")).toBe(true);
    });

    it("should return true for Alibaba URLs even without product-detail (best effort)", () => {
      // isValidAlibabaUrl only checks hostname, not path
      expect(isValidAlibabaUrl("https://www.alibaba.com/product.html")).toBe(true);
    });

    it("should use isAlibabaProductUrl to check for product-detail", () => {
      expect(isAlibabaProductUrl("https://www.alibaba.com/product-detail/123.html")).toBe(true);
      expect(isAlibabaProductUrl("https://www.alibaba.com/product.html")).toBe(false);
    });

    it("should return false for non-Alibaba URLs", () => {
      expect(isValidAlibabaUrl("https://www.temu.com/goods.html")).toBe(false);
      expect(isValidAlibabaUrl("https://www.example.com")).toBe(false);
    });

    it("should return false for invalid URLs", () => {
      expect(isValidAlibabaUrl("")).toBe(false);
      expect(isValidAlibabaUrl("not-a-url")).toBe(false);
    });

    it("should handle URLs with whitespace", () => {
      expect(isValidAlibabaUrl("  https://www.alibaba.com/product-detail/123.html  ")).toBe(true);
    });
  });

  describe("validateAndNormalizeUrl", () => {
    it("should validate and normalize Temu URLs", () => {
      const url = "  https://www.temu.com/goods.html?goods_id=123&utm_source=google  ";
      const result = validateAndNormalizeUrl(url, "temu");
      
      expect(result).toBeTruthy();
      expect(result).not.toContain("utm_source");
      expect(result).toContain("goods_id=123");
    });

    it("should validate and normalize Alibaba URLs", () => {
      const url = "  https://www.alibaba.com/product-detail/123.html?spm=abc  ";
      const result = validateAndNormalizeUrl(url, "alibaba");
      
      expect(result).toBeTruthy();
      expect(result).not.toContain("spm");
      expect(result).toContain("product-detail/123.html");
    });

    it("should return null for invalid provider URLs", () => {
      expect(validateAndNormalizeUrl("https://www.example.com", "temu")).toBeNull();
      expect(validateAndNormalizeUrl("https://www.temu.com/goods.html", "alibaba")).toBeNull();
    });

    it("should return null for empty/invalid input", () => {
      expect(validateAndNormalizeUrl("", "temu")).toBeNull();
      expect(validateAndNormalizeUrl("   ", "temu")).toBeNull();
    });
  });

  describe("extractTemuParams", () => {
    it("should extract goods_id from Temu URL", () => {
      const url = "https://www.temu.com/goods.html?goods_id=123456789";
      const params = extractTemuParams(url);
      
      expect(params.goodsId).toBe("123456789");
    });

    it("should extract all essential parameters", () => {
      const url = "https://www.temu.com/goods.html?goods_id=123&top_gallery_url=https://example.com/img.jpg&spec_gallery_id=456";
      const params = extractTemuParams(url);
      
      expect(params.goodsId).toBe("123");
      expect(params.topGalleryUrl).toBe("https://example.com/img.jpg");
      expect(params.specGalleryId).toBe("456");
    });

    it("should return empty object if no params found", () => {
      const url = "https://www.temu.com/goods.html";
      const params = extractTemuParams(url);
      
      expect(params.goodsId).toBeUndefined();
    });

    it("should handle invalid URLs gracefully", () => {
      const params = extractTemuParams("not-a-url");
      expect(params).toEqual({});
    });
  });

  describe("extractAlibabaProductId", () => {
    it("should extract product ID from Alibaba URL", () => {
      const url = "https://www.alibaba.com/product-detail/123456789.html";
      const productId = extractAlibabaProductId(url);
      
      expect(productId).toBe("123456789");
    });

    it("should extract product ID with query parameters", () => {
      const url = "https://www.alibaba.com/product-detail/987654321.html?spm=abc";
      const productId = extractAlibabaProductId(url);
      
      expect(productId).toBe("987654321");
    });

    it("should return null if product ID not found", () => {
      const url = "https://www.alibaba.com/product.html";
      const productId = extractAlibabaProductId(url);
      
      expect(productId).toBeNull();
    });

    it("should handle invalid URLs gracefully", () => {
      const productId = extractAlibabaProductId("not-a-url");
      expect(productId).toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("should handle URLs with only whitespace", () => {
      expect(normalizeUrl("   ")).toBe("");
      expect(isValidTemuUrl("   ")).toBe(false);
      expect(isValidAlibabaUrl("   ")).toBe(false);
    });

    it("should handle URLs without https/http", () => {
      const normalized = normalizeUrl("www.temu.com/goods.html");
      expect(normalized).toMatch(/^https:/);
    });

    it("should handle very long query strings", () => {
      const longParams = Array(100).fill("param=value").join("&");
      const url = `https://www.temu.com/goods.html?goods_id=123&${longParams}&utm_source=google`;
      const normalized = normalizeUrl(url);
      
      expect(normalized).not.toContain("utm_source");
      expect(normalized).toContain("goods_id=123");
    });

    it("should handle invalid domain gracefully", () => {
      const invalidUrl = "https://invalid-domain-that-does-not-exist-12345.com/product.html";
      const normalized = normalizeUrl(invalidUrl);
      
      // Should return normalized URL even if domain is invalid
      expect(normalized).toContain("invalid-domain");
    });

    it("should handle special characters in URL", () => {
      const url = "https://www.temu.com/goods.html?goods_id=123&name=Test%20Product";
      const normalized = normalizeUrl(url);
      
      expect(normalized).toContain("goods_id=123");
    });

    it("should handle URLs with fragments", () => {
      const url = "https://www.temu.com/goods.html?goods_id=123#section";
      const normalized = normalizeUrl(url);
      
      expect(normalized).toContain("goods_id=123");
      // Fragment should be preserved
      expect(normalized).toContain("#section");
    });
  });
});

