/**
 * Launch RC1 verification harness — read-only evidence for checklist.
 * npx tsx -r dotenv/config scripts/_launch-rc1-verify.ts
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import {
  filterByMinRelevance,
  rankProductsForSearch,
} from "../lib/storefront/product-search.ts";
import { parseImages } from "../lib/merchandiser/full-catalog-pass";

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      compareAtPrice: true,
      images: true,
      stock: true,
      category: true,
      tags: true,
      shortDescription: true,
      metaTitle: true,
      metaDescription: true,
    },
  });

  let missingImages = 0;
  let badPrice = 0;
  let badCompare = 0;
  let zeroStock = 0;
  const sampleMissing: string[] = [];

  for (const p of products) {
    const imgs = parseImages(p.images);
    if (!imgs.length) {
      missingImages += 1;
      if (sampleMissing.length < 10) sampleMissing.push(p.name);
    }
    if (!(p.price > 0)) badPrice += 1;
    if (
      p.compareAtPrice != null &&
      p.compareAtPrice > 0 &&
      p.compareAtPrice < p.price
    ) {
      badCompare += 1;
    }
    if (p.stock <= 0) zeroStock += 1;
  }

  const searchQueries = [
    "mus",
    "musmatte",
    "musematte",
    "tastatur",
    "gaming tastatur",
    "usb c",
    "usb-c",
    "webcam",
    "mobilholder",
    "iphone deksel",
  ];

  const searchResults: Array<{
    q: string;
    hits: number;
    top3: string[];
    pass: boolean;
    note?: string;
  }> = [];

  for (const q of searchQueries) {
    const ranked = filterByMinRelevance(rankProductsForSearch(products, q));
    const top3 = ranked.slice(0, 3).map((p) => p.name);
    let pass = ranked.length > 0;
    let note: string | undefined;
    if (q === "iphone deksel" && ranked.length === 0) {
      note = "0 treff — kan være kataloghull (få reelle deksel)";
      pass = false;
    }
    if (q === "musmatte" && ranked.length === 0) {
      note = "forventet å treffe musematte via synonym/compound";
      pass = false;
    }
    searchResults.push({ q, hits: ranked.length, top3, pass, note });
  }

  const variantStats = await prisma.productVariant.groupBy({
    by: ["isActive"],
    _count: { id: true },
  });

  const productsWithVariants = await prisma.product.count({
    where: { isActive: true, variants: { some: {} } },
  });

  const env = {
    stripeSecret: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    stripePublishable: Boolean(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
        process.env.STRIPE_PUBLISHABLE_KEY?.trim()
    ),
    database: Boolean(process.env.DATABASE_URL?.trim()),
    ga4Public: Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()),
    ga4Secret: Boolean(process.env.GA4_API_SECRET?.trim()),
    metaPixelPublic: Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim()),
    metaCapi: Boolean(process.env.META_CAPI_ACCESS_TOKEN?.trim()),
    adminSecret: Boolean(
      process.env.ADMIN_PASSWORD?.trim() ||
        process.env.NEXTAUTH_SECRET?.trim() ||
        process.env.AUTH_SECRET?.trim()
    ),
  };

  const grades = { A: 0, B: 0, C: 0, D: 0, other: 0 };
  for (const p of products) {
    try {
      const tags = JSON.parse(p.tags || "[]") as string[];
      const g = tags.find((t) => /^merch:[ABCD]$/i.test(t));
      if (g) grades[g.split(":")[1]!.toUpperCase() as "A" | "B" | "C" | "D"] += 1;
      else grades.other += 1;
    } catch {
      grades.other += 1;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    catalog: {
      active: products.length,
      missingImages,
      sampleMissing,
      badPrice,
      badCompare,
      zeroStock,
      productsWithVariants,
      variantStats,
      grades,
    },
    search: searchResults,
    env,
  };

  const out = path.join(process.cwd(), "tmp", "launch-rc1-verify.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
