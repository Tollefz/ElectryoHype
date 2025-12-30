import { describe, it, expect, beforeEach } from "vitest";
import { TemuProvider } from "../temu-provider";

describe("TemuProvider", () => {
  let provider: TemuProvider;

  beforeEach(() => {
    provider = new TemuProvider();
  });

  describe("getName", () => {
    it("should return 'temu'", () => {
      expect(provider.getName()).toBe("temu");
    });
  });

  describe("canHandle", () => {
    it("should return true for temu.com URLs", () => {
      expect(provider.canHandle("https://www.temu.com/goods.html?goods_id=123")).toBe(true);
      expect(provider.canHandle("https://temu.com/product.html")).toBe(true);
    });

    it("should return true for temu.co.uk URLs", () => {
      expect(provider.canHandle("https://www.temu.co.uk/goods.html")).toBe(true);
    });

    it("should return true for temu-cdn URLs", () => {
      expect(provider.canHandle("https://temu-cdn.com/image.jpg")).toBe(true);
    });

    it("should return false for non-Temu URLs", () => {
      expect(provider.canHandle("https://www.alibaba.com/product.html")).toBe(false);
      expect(provider.canHandle("https://www.ebay.com/item.html")).toBe(false);
      expect(provider.canHandle("https://www.example.com")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(provider.canHandle("https://www.TEMU.com/goods.html")).toBe(true);
      expect(provider.canHandle("https://www.Temu.COM/product.html")).toBe(true);
    });
  });

  describe("normalizeUrl", () => {
    it("should use shared URL normalization utility", () => {
      const url =
        "https://www.temu.com/goods.html?goods_id=123&utm_source=google&utm_medium=cpc&ref=123&gclid=abc";
      const normalized = provider.normalizeUrl(url);
      
      expect(normalized).not.toContain("utm_source");
      expect(normalized).not.toContain("utm_medium");
      expect(normalized).not.toContain("ref");
      expect(normalized).not.toContain("gclid");
      expect(normalized).toContain("goods_id=123");
    });

    it("should preserve essential parameters", () => {
      const url =
        "https://www.temu.com/goods.html?goods_id=123&top_gallery_url=https://example.com/image.jpg&spec_gallery_id=456";
      const normalized = provider.normalizeUrl(url);
      
      expect(normalized).toContain("goods_id=123");
      expect(normalized).toContain("top_gallery_url");
      expect(normalized).toContain("spec_gallery_id=456");
    });

    it("should normalize domain to www.temu.com", () => {
      const url = "https://temu.com/goods.html";
      const normalized = provider.normalizeUrl(url);
      
      expect(normalized).toContain("www.temu.com");
    });

    it("should normalize protocol to https", () => {
      const url = "http://www.temu.com/goods.html";
      const normalized = provider.normalizeUrl(url);
      
      expect(normalized).toMatch(/^https:/);
    });

    it("should trim whitespace", () => {
      const url = "  https://www.temu.com/goods.html  ";
      const normalized = provider.normalizeUrl(url);
      
      expect(normalized).not.toMatch(/^\s/);
      expect(normalized).not.toMatch(/\s$/);
    });
  });
});

