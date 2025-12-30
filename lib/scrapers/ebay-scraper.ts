import "server-only";

import { BaseScraper } from "./base-scraper.server";
import type { ScraperResult, Scraper } from "./types";

export class EbayScraper extends BaseScraper implements Scraper {
  async scrapeProduct(url: string): Promise<ScraperResult> {
    try {
      const $ = await this.fetchHtml(url);
      const title =
        $("h1[itemprop='name']").text().trim() ||
        $("meta[property='og:title']").attr("content") ||
        "eBay product";

      const priceString =
        $("span[itemprop='price']").attr("content") ||
        $("span[itemprop='price']").text() ||
        $("meta[property='og:price:amount']").attr("content") ||
        "0";

      const amount = this.parsePrice(priceString) ?? 0;

      const currency =
        $("span[itemprop='priceCurrency']").attr("content") ||
        $("meta[property='og:price:currency']").attr("content") ||
        (this.options.currency ?? "USD");

      const images =
        $("img[itemprop='image']")
          .map((_, el) => $(el).attr("src"))
          .get()
          .filter(Boolean) || [];

      const description =
        $("#desc_div").text().trim() ||
        $("#viTabs_0_is").text().trim() ||
        $("meta[property='og:description']").attr("content") ||
        "";

      const specs: Record<string, string> = {};
      $("#viTabs_0_is table tr").each((_, row) => {
        const key = $(row).find("td").first().text().trim();
        const value = $(row).find("td").eq(1).text().trim();
        if (key && value) {
          specs[key] = value;
        }
      });

      return this.toResult(
        {
          supplier: "ebay",
          url,
          title,
          description,
          price: { amount, currency },
          images,
          specs,
          availability: true,
        },
        $.html()
      );
    } catch (error) {
      return this.failure(error);
    }
  }

  async scrapePrice(url: string): Promise<number> {
    const result = await this.scrapeProduct(url);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Unable to scrape eBay price");
    }
    return result.data.price.amount;
  }

  async scrapeImages(url: string): Promise<string[]> {
    const result = await this.scrapeProduct(url);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Unable to scrape eBay images");
    }
    return result.data.images;
  }

  async scrapeDescription(url: string): Promise<string> {
    const result = await this.scrapeProduct(url);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Unable to scrape eBay description");
    }
    return result.data.description;
  }
}

