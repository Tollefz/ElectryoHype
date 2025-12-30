// Client-safe exports (types and utilities without Puppeteer)
// This file is safe to import in client components
// DO NOT export any scrapers or functions that use Puppeteer here

export * from "./types";
// Only export TemuScraper which doesn't use Puppeteer
export * from "./temu-scraper";
// Export supplier identifier (no Puppeteer dependencies)
export * from "./supplier-identifier";

import { identifySupplier } from "./supplier-identifier";

// Re-export identifySupplier for backward compatibility
export { identifySupplier };
