import { describe, it, expect, beforeEach } from "vitest";
import { ProviderRegistry } from "../provider-registry";
import { TemuProvider } from "../temu-provider";
import type { ImportProvider } from "../types";

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  describe("getProvider", () => {
    it("should return TemuProvider for 'temu'", () => {
      const provider = registry.getProvider("temu");
      expect(provider).toBeInstanceOf(TemuProvider);
      expect(provider?.getName()).toBe("temu");
    });

    it("should return null for unknown provider", () => {
      const provider = registry.getProvider("unknown");
      expect(provider).toBeNull();
    });
  });

  describe("detectProvider", () => {
    it("should detect TemuProvider for Temu URLs", () => {
      const provider = registry.detectProvider("https://www.temu.com/goods.html?goods_id=123");
      expect(provider).toBeInstanceOf(TemuProvider);
      expect(provider?.getName()).toBe("temu");
    });

    it("should return null for unsupported URLs", () => {
      const provider = registry.detectProvider("https://www.example.com/product.html");
      expect(provider).toBeNull();
    });

    it("should detect provider for temu.co.uk URLs", () => {
      const provider = registry.detectProvider("https://www.temu.co.uk/goods.html");
      expect(provider).toBeInstanceOf(TemuProvider);
    });
  });

  describe("getProviderForUrl", () => {
    it("should return provider when name matches and can handle URL", () => {
      const provider = registry.getProviderForUrl(
        "https://www.temu.com/goods.html",
        "temu"
      );
      expect(provider).toBeInstanceOf(TemuProvider);
    });

    it("should return null when specified provider cannot handle URL", () => {
      const provider = registry.getProviderForUrl(
        "https://www.alibaba.com/product.html",
        "temu"
      );
      expect(provider).toBeNull();
    });

    it("should auto-detect when no provider name is specified", () => {
      const provider = registry.getProviderForUrl("https://www.temu.com/goods.html");
      expect(provider).toBeInstanceOf(TemuProvider);
    });

    it("should return null when URL is not supported and no provider name specified", () => {
      const provider = registry.getProviderForUrl("https://www.example.com/product.html");
      expect(provider).toBeNull();
    });
  });

  describe("register", () => {
    it("should register a custom provider", () => {
      const customProvider: ImportProvider = {
        getName: () => "custom",
        canHandle: (url: string) => url.includes("custom.com"),
        normalizeUrl: (url: string) => url,
        fetchProduct: async () => ({}),
        mapToProduct: (raw, url) => ({
          supplier: "temu",
          url,
          title: "Test",
          description: "",
          price: { amount: 0, currency: "USD" },
          images: [],
          variants: [],
        }),
      };

      registry.register(customProvider);
      const provider = registry.getProvider("custom");
      expect(provider).toBe(customProvider);
    });
  });

  describe("isUrlSupported", () => {
    it("should return true for supported URLs", () => {
      expect(registry.isUrlSupported("https://www.temu.com/goods.html")).toBe(true);
      expect(registry.isUrlSupported("https://www.temu.co.uk/product.html")).toBe(true);
    });

    it("should return false for unsupported URLs", () => {
      expect(registry.isUrlSupported("https://www.example.com/product.html")).toBe(false);
    });
  });

  describe("getAllProviders", () => {
    it("should return all registered providers", () => {
      const providers = registry.getAllProviders();
      expect(providers.length).toBeGreaterThan(0);
      expect(providers.some((p) => p instanceof TemuProvider)).toBe(true);
    });
  });
});

