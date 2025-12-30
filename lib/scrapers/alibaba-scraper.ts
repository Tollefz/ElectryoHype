import "server-only";

import type { Page } from "puppeteer";
import { BaseScraper } from "./base-scraper.server";
import type { ScraperResult, Scraper } from "./types";

const SELECTORS = {
  title: ".module-pc-detail-heading .title",
  priceRange: ".price .price-text",
  images: ".product-image-gallery img",
  description: "#J-rich-text-description",
  specsRows: ".do-entry-list li",
  shipping: ".trade-detail-main-wrap .module-pc-ship .text",
};

export class AlibabaScraper extends BaseScraper implements Scraper {
  async scrapeProduct(url: string): Promise<ScraperResult> {
    try {
      const data = await this.withPage(url, async (page) => this.parseProduct(page, url));
      return this.toResult({ ...data, supplier: "alibaba", url }, data.rawHtml);
    } catch (error) {
      return this.failure(error);
    }
  }

  async scrapePrice(url: string): Promise<number> {
    const result = await this.scrapeProduct(url);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Unable to scrape Alibaba price");
    }
    return result.data.price.amount;
  }

  async scrapeImages(url: string): Promise<string[]> {
    const result = await this.scrapeProduct(url);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Unable to scrape Alibaba images");
    }
    return result.data.images;
  }

  async scrapeDescription(url: string): Promise<string> {
    const result = await this.scrapeProduct(url);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Unable to scrape Alibaba description");
    }
    return result.data.description;
  }

  private async parseProduct(page: Page, url: string) {
    await page.waitForSelector(SELECTORS.title, { timeout: 45_000 });
    const html = await page.content();
    const title =
      (await page.$eval(SELECTORS.title, (el) => el.textContent?.trim() ?? "")) ?? "Unnamed product";

    const priceText =
      (await page.$eval(SELECTORS.priceRange, (el) => el.textContent ?? "")) ?? "0";

    const amount = this.normalizeAlibabaPrice(priceText);
    if (!amount) {
      throw new Error("Unable to parse Alibaba price");
    }

    const images = await page.$$eval(SELECTORS.images, (imgs) =>
      imgs
        .map((img) => img.getAttribute("src") || img.getAttribute("data-src"))
        .filter(Boolean)
        .map((src) => new URL(src!, url).toString())
    );

    const description =
      (await page.$eval(SELECTORS.description, (el) => el.innerHTML.trim())) ?? "";

    const specsArray = await page.$$eval(SELECTORS.specsRows, (rows) =>
      rows
        .map((row) => {
          const key = row.querySelector(".do-entry-item")?.textContent?.trim();
          const value = row.querySelector(".do-entry-value")?.textContent?.trim();
          if (key && value) {
            return [key, value] as const;
          }
          return null;
        })
        .filter(Boolean) as Array<readonly [string, string]>
    );

    const specs = Object.fromEntries(specsArray);
    const shippingEstimate =
      (await page.$eval(SELECTORS.shipping, (el) => el.textContent?.trim() ?? "")) || undefined;

    return {
      title,
      description,
      rawHtml: html,
      price: {
        amount,
        currency: this.options.currency ?? "USD",
      },
      images,
      specs,
      shippingEstimate,
      availability: true,
    };
  }

  private normalizeAlibabaPrice(text: string) {
    const parts = text.split("-").map((part) => this.parsePrice(part));
    const prices = parts.filter((value): value is number => typeof value === "number");
    if (!prices.length) return null;
    return Math.min(...prices);
  }
}

