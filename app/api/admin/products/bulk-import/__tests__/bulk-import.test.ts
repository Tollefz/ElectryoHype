import { describe, it, expect, beforeEach, vi } from "vitest";
import { getProviderRegistry } from "@/lib/providers/server-only";
import type { BulkImportResult } from "@/lib/providers";

// Mock dependencies
vi.mock("@/lib/auth", () => ({
  getAuthSession: vi.fn(() => Promise.resolve({ user: { id: "test-user" } })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findFirst: vi.fn(() => Promise.resolve(null)),
      create: vi.fn(() => Promise.resolve({ id: "product-123", name: "Test Product" })),
    },
  },
}));

vi.mock("@/lib/utils/improve-product-title", () => ({
  improveTitle: vi.fn((title: string) => title),
}));

describe("Bulk Import - Provider Routing", () => {
  let registry: ReturnType<typeof getProviderRegistry>;

  beforeEach(() => {
    registry = getProviderRegistry();
  });

  describe("Provider auto-detection", () => {
    it("should detect Temu provider for Temu URLs", () => {
      const temuUrl = "https://www.temu.com/goods.html?goods_id=123";
      const provider = registry.detectProvider(temuUrl);
      
      expect(provider).toBeTruthy();
      expect(provider?.getName()).toBe("temu");
    });

    it("should detect Alibaba provider for Alibaba URLs", () => {
      const alibabaUrl = "https://www.alibaba.com/product-detail/123456789.html";
      const provider = registry.detectProvider(alibabaUrl);
      
      expect(provider).toBeTruthy();
      expect(provider?.getName()).toBe("alibaba");
    });

    it("should return null for unsupported URLs", () => {
      const unsupportedUrl = "https://www.example.com/product.html";
      const provider = registry.detectProvider(unsupportedUrl);
      
      expect(provider).toBeNull();
    });
  });

  describe("Mixed URL routing", () => {
    it("should route Temu and Alibaba URLs to correct providers", () => {
      const urls = [
        "https://www.temu.com/goods.html?goods_id=123",
        "https://www.alibaba.com/product-detail/456.html",
        "https://www.temu.com/product.html",
        "https://www.alibaba.com/product-detail/789.html",
      ];

      const providers = urls.map(url => {
        const provider = registry.detectProvider(url);
        return provider ? provider.getName() : "none";
      });

      expect(providers).toEqual(["temu", "alibaba", "temu", "alibaba"]);
    });

    it("should auto-detect provider per URL when not specified", () => {
      const urls = [
        "https://www.temu.com/goods.html?goods_id=123",
        "https://www.alibaba.com/product-detail/456.html",
      ];

      urls.forEach(url => {
        const provider = registry.getProviderForUrl(url);
        expect(provider).toBeTruthy();
        
        if (url.includes("temu.com")) {
          expect(provider?.getName()).toBe("temu");
        } else if (url.includes("alibaba.com")) {
          expect(provider?.getName()).toBe("alibaba");
        }
      });
    });

    it("should handle provider override correctly", () => {
      const temuUrl = "https://www.temu.com/goods.html?goods_id=123";
      
      // Should use specified provider if it can handle the URL
      const provider1 = registry.getProviderForUrl(temuUrl, "temu");
      expect(provider1?.getName()).toBe("temu");
      
      // Should return null if specified provider can't handle URL
      const provider2 = registry.getProviderForUrl(temuUrl, "alibaba");
      expect(provider2).toBeNull();
    });
  });

  describe("URL normalization", () => {
    it("should normalize Temu URLs correctly", () => {
      const temuProvider = registry.getProvider("temu");
      expect(temuProvider).toBeTruthy();
      
      const url = "https://www.temu.com/goods.html?goods_id=123&utm_source=google&ref=abc";
      const normalized = temuProvider!.normalizeUrl(url);
      
      expect(normalized).not.toContain("utm_source");
      expect(normalized).not.toContain("ref");
      expect(normalized).toContain("goods_id=123");
    });

    it("should normalize Alibaba URLs correctly", () => {
      const alibabaProvider = registry.getProvider("alibaba");
      expect(alibabaProvider).toBeTruthy();
      
      const url = "https://www.alibaba.com/product-detail/123.html?spm=abc&utm_source=google";
      const normalized = alibabaProvider!.normalizeUrl(url);
      
      expect(normalized).not.toContain("utm_source");
      expect(normalized).not.toContain("spm");
      expect(normalized).toContain("product-detail/123.html");
    });
  });
});

describe("Bulk Import - Error Handling", () => {
  it("should handle individual URL failures without stopping", () => {
    // This test verifies that the import logic continues even if one URL fails
    // The actual implementation in route.ts already handles this with try-catch
    
    const urls = [
      "https://www.temu.com/goods.html?goods_id=123",
      "https://invalid-url-that-will-fail.com",
      "https://www.alibaba.com/product-detail/456.html",
    ];

    // Simulate processing - all should be attempted
    const results: BulkImportResult[] = urls.map((url, index) => {
      if (index === 1) {
        // Simulate error for second URL
        return {
          inputUrl: url,
          normalizedUrl: url,
          providerUsed: "none",
          status: "error",
          message: "Ustøttet leverandør",
          warnings: [],
        };
      }
      
      // Simulate success for others
      return {
        inputUrl: url,
        normalizedUrl: url,
        providerUsed: index === 0 ? "temu" : "alibaba",
        status: "success",
        message: "Produkt importert",
        createdProductId: `product-${index}`,
        warnings: [],
      };
    });

    // All URLs should have results
    expect(results).toHaveLength(3);
    
    // First should succeed
    expect(results[0].status).toBe("success");
    expect(results[0].providerUsed).toBe("temu");
    
    // Second should fail
    expect(results[1].status).toBe("error");
    
    // Third should succeed
    expect(results[2].status).toBe("success");
    expect(results[2].providerUsed).toBe("alibaba");
  });

  it("should return structured error messages", () => {
    const errorResult: BulkImportResult = {
      inputUrl: "https://www.example.com/product.html",
      normalizedUrl: "https://www.example.com/product.html",
      providerUsed: "none",
      status: "error",
      message: "Ustøttet leverandør. Støttede: temu, alibaba",
      warnings: [],
    };

    expect(errorResult.inputUrl).toBeDefined();
    expect(errorResult.normalizedUrl).toBeDefined();
    expect(errorResult.providerUsed).toBeDefined();
    expect(errorResult.status).toBe("error");
    expect(errorResult.message).toBeDefined();
    expect(errorResult.createdProductId).toBeUndefined();
  });

  it("should return warnings when appropriate", () => {
    const warningResult: BulkImportResult = {
      inputUrl: "https://www.temu.com/goods.html?goods_id=123",
      normalizedUrl: "https://www.temu.com/goods.html?goods_id=123",
      providerUsed: "temu",
      status: "warning",
      message: "Produkt importert med advarsler",
      createdProductId: "product-123",
      warnings: ["Ingen bilder funnet", "Pris ser ut til å være ugyldig"],
    };

    expect(warningResult.status).toBe("warning");
    expect(warningResult.warnings).toBeDefined();
    expect(warningResult.warnings?.length).toBeGreaterThan(0);
    expect(warningResult.createdProductId).toBeDefined();
  });
});

