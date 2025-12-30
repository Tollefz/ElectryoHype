/**
 * Server-only exports for providers
 * 
 * This file contains exports that should ONLY be used in server-side code
 * (API routes, server actions, server components).
 * 
 * DO NOT import from this file in client components ("use client").
 * Use API routes or server actions instead.
 */

// Mark this file as server-only using the server-only package
// This prevents Next.js from bundling this file in client bundles
import "server-only";

import type { ImportProvider } from "./types";
import { TemuProvider } from "./temu-provider";
import { AlibabaProvider } from "./alibaba-provider";

/**
 * Registry for import providers
 * Manages provider registration and selection
 * 
 * SERVER-ONLY: This class imports scrapers that may use Puppeteer
 */
export class ProviderRegistry {
  private providers: Map<string, ImportProvider> = new Map();
  private defaultProviders: ImportProvider[] = [];

  constructor() {
    // Register default providers
    this.registerDefaultProviders();
  }

  /**
   * Register default providers
   */
  private registerDefaultProviders(): void {
    const temuProvider = new TemuProvider();
    this.register(temuProvider);
    this.defaultProviders.push(temuProvider);
    
    const alibabaProvider = new AlibabaProvider();
    this.register(alibabaProvider);
    this.defaultProviders.push(alibabaProvider);
  }

  /**
   * Register a new provider
   */
  register(provider: ImportProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  /**
   * Get provider by name
   */
  getProvider(name: string): ImportProvider | null {
    return this.providers.get(name) || null;
  }

  /**
   * Auto-detect provider for a URL
   */
  detectProvider(url: string): ImportProvider | null {
    // Try registered providers in order
    for (const provider of this.providers.values()) {
      if (provider.canHandle(url)) {
        return provider;
      }
    }

    return null;
  }

  /**
   * Get provider by name or auto-detect from URL
   */
  getProviderForUrl(url: string, providerName?: string): ImportProvider | null {
    // If provider name is specified, use it
    if (providerName) {
      const provider = this.getProvider(providerName);
      if (provider && provider.canHandle(url)) {
        return provider;
      }
      // If specified provider can't handle the URL, return null
      return null;
    }

    // Otherwise, auto-detect
    return this.detectProvider(url);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): ImportProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Check if a URL is supported by any provider
   */
  isUrlSupported(url: string): boolean {
    return this.detectProvider(url) !== null;
  }
}

// Singleton instance
let registryInstance: ProviderRegistry | null = null;

/**
 * Get the global provider registry instance
 * 
 * SERVER-ONLY: This function returns a registry that may use Puppeteer
 * Do not call this from client components.
 */
export function getProviderRegistry(): ProviderRegistry {
  if (!registryInstance) {
    registryInstance = new ProviderRegistry();
  }
  return registryInstance;
}

