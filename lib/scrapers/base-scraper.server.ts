/**
 * Server-only base scraper
 * 
 * This file contains the BaseScraper class that uses Puppeteer.
 * It should ONLY be used in server-side code.
 * 
 * DO NOT import from this file in client components.
 */

import "server-only";

import axios from "axios";
import * as cheerio from "cheerio";
import type { Browser, Page } from "puppeteer";
import { randomUUID } from "crypto";
import { ScraperOptions, ScrapedProductData, ScraperResult } from "./types";

// Dynamic import function for puppeteer to avoid top-level imports
async function getPuppeteer() {
  const puppeteerExtraMod = await import("puppeteer-extra");
  const stealthMod = await import("puppeteer-extra-plugin-stealth");
  const puppeteerMod = await import("puppeteer");
  const puppeteerExtra = puppeteerExtraMod.default ?? puppeteerExtraMod;
  const StealthPlugin = stealthMod.default ?? stealthMod;
  const puppeteer = puppeteerMod.default ?? puppeteerMod;
  puppeteerExtra.use(StealthPlugin());
  return { puppeteerExtra, puppeteer };
}

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
];

const DEFAULT_DELAY = { min: 1000, max: 2500 };

export abstract class BaseScraper {
  protected options: ScraperOptions;

  constructor(options?: ScraperOptions) {
    this.options = {
      currency: "USD",
      userAgentRotation: true,
      minDelayMs: DEFAULT_DELAY.min,
      maxDelayMs: DEFAULT_DELAY.max,
      ...options,
    };
  }

  abstract scrapeProduct(url: string): Promise<ScraperResult>;
  abstract scrapePrice(url: string): Promise<number>;
  abstract scrapeImages(url: string): Promise<string[]>;
  abstract scrapeDescription(url: string): Promise<string>;

  protected async fetchHtml(url: string) {
    const response = await axios.get(url, {
      headers: {
        "user-agent": this.randomUserAgent(),
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": this.options.locale ?? "en-US,en;q=0.9",
        "cache-control": "no-cache",
      },
      timeout: 30_000,
    });

    return cheerio.load(response.data);
  }

  protected async withPage<T>(url: string, fn: (page: Page) => Promise<T>): Promise<T> {
    const browser = await this.launchBrowser();
    const page = await browser.newPage();
    
    // Hide webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'no'],
      });
      
      // Mock Chrome
      (window as any).chrome = {
        runtime: {},
      };
    });
    
    // Set realistic user agent and headers
    const userAgent = this.randomUserAgent();
    await page.setUserAgent(userAgent);
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      "accept-language": this.options.locale ?? "en-US,en;q=0.9,no;q=0.8,nb;q=0.7",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-encoding": "gzip, deflate, br",
      "dnt": "1",
      "upgrade-insecure-requests": "1",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "cache-control": "max-age=0",
    });

    try {
      console.log(`🌐 Navigating to: ${url.substring(0, 80)}...`);
      await page.goto(url, { 
        waitUntil: "networkidle2",
        timeout: 120_000 
      });
      
      // Wait for network to be idle (additional wait)
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Additional wait for dynamic content
      await this.randomDelay();
      
      const result = await fn(page);
      return result;
    } finally {
      await page.close();
      await browser.close();
    }
  }

  protected async randomDelay() {
    const min = this.options.minDelayMs ?? DEFAULT_DELAY.min;
    const max = this.options.maxDelayMs ?? DEFAULT_DELAY.max;
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected randomUserAgent() {
    if (!this.options.userAgentRotation) return USER_AGENTS[0];
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  protected async launchBrowser(): Promise<Browser> {
    const { puppeteer } = await getPuppeteer();
    return puppeteer.launch({
      headless: true, // Use headless mode
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled", // Hide automation
        "--disable-features=IsolateOrigins,site-per-process",
        "--window-size=1920,1080",
        "--start-maximized",
        "--lang=en-US,en,no",
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    });
  }

  protected parsePrice(text?: string): number | null {
    if (!text) return null;
    const sanitized = text.replace(/[, ]+/g, "").replace(/[^\d.]/g, "");
    const parsed = Number.parseFloat(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  protected toResult(data: ScrapedProductData, rawHtml?: string): ScraperResult {
    return { success: true, data, rawHtml };
  }

  protected failure(error: unknown, rawHtml?: string): ScraperResult {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown scraper error",
      rawHtml,
    };
  }
}
