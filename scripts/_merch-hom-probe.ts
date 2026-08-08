/**
 * Head of Merchandising — catalog audit (read-only probe).
 * npx tsx -r dotenv/config scripts/_merch-hom-probe.ts
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import {
  decideUnpublish,
  imageIssues,
  norwegianRetailTitle,
  needsDescriptionRewrite,
  parseImages,
  priceAnomaly,
  suggestCategory,
  type MerchProduct,
} from "../lib/merchandiser/full-catalog-pass";

const prisma = new PrismaClient();

function baseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+\d{3,5}\b/g, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasNumberSuffix(name: string): boolean {
  return /\b\d{3,5}\b/.test(name) || /\s\d{2,4}$/.test(name.trim());
}

function mistranslatedShort(name: string, short: string | null): boolean {
  if (!short) return true;
  const n = name.toLowerCase();
  const s = short.toLowerCase();
  if (/musematte|mouse\s*pad|desk\s*pad/.test(n) && /\bmusen\b|gamingmus|dpi\b/.test(s))
    return true;
  if (/ruter|router|wifi/.test(n) && /iphone|2\s*w\b|3\.5\s*mm/.test(s)) return true;
  if (/høyttaler|hoyttaler|speaker/.test(n) && /chargers?/.test(s)) return true;
  if (/tastatur|keyboard/.test(n) && /\bmusen\b|musematte/.test(s) && !/mus\b/.test(n))
    return true;
  return false;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      metaTitle: true,
      metaDescription: true,
      shortDescription: true,
      description: true,
      category: true,
      subcategory: true,
      price: true,
      compareAtPrice: true,
      supplierPrice: true,
      images: true,
      specs: true,
      tags: true,
      qualityScore: true,
      buyerLifecycle: true,
      stock: true,
      createdAt: true,
    },
  });

  const variants = await prisma.productVariant.groupBy({
    by: ["productId"],
    _count: { id: true },
  });
  const variantCount = new Map(variants.map((v) => [v.productId, v._count.id]));

  const allVariants = await prisma.productVariant.findMany({
    where: { isActive: true },
    select: { productId: true, name: true },
    take: 5000,
  });
  const badVariantNames: Array<{ productId: string; name: string }> = [];
  for (const v of allVariants) {
    if (/^(black|white|red|blue|green|pink|grey|gray)\s*\d+/i.test(v.name || "")) {
      badVariantNames.push({ productId: v.productId, name: v.name });
    }
  }

  const byBase = new Map<string, typeof products>();
  const flags = {
    unpublish: [] as Array<{ id: string; name: string; reason: string }>,
    numberedTitle: [] as Array<{ id: string; name: string; suggested: string }>,
    badShort: [] as Array<{ id: string; name: string; short: string | null }>,
    needDesc: [] as Array<{ id: string; name: string }>,
    catMove: [] as Array<{ id: string; name: string; from: string | null; to: string }>,
    price: [] as Array<{ id: string; name: string; flag: string; price: number }>,
    images: [] as Array<{ id: string; name: string; issues: string[] }>,
    noImages: [] as Array<{ id: string; name: string }>,
    caps: [] as Array<{ id: string; name: string }>,
    factorySpeak: [] as Array<{ id: string; name: string }>,
  };

  for (const p of products) {
    const base = baseName(p.name);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(p);

    const mp = p as unknown as MerchProduct;
    const u = decideUnpublish(mp);
    if (u?.unpublish) flags.unpublish.push({ id: p.id, name: p.name, reason: u.reason });

    if (hasNumberSuffix(p.name)) {
      const suggested = norwegianRetailTitle(p.name.replace(/\s+\d{3,5}\b/g, "").trim());
      flags.numberedTitle.push({ id: p.id, name: p.name, suggested });
    }
    if (mistranslatedShort(p.name, p.shortDescription)) {
      flags.badShort.push({ id: p.id, name: p.name, short: p.shortDescription });
    }
    if (needsDescriptionRewrite(p.shortDescription, p.description)) {
      flags.needDesc.push({ id: p.id, name: p.name });
    }
    const cat = suggestCategory(mp);
    if (cat) flags.catMove.push({ id: p.id, name: p.name, from: p.category, to: cat });
    const pa = priceAnomaly(mp);
    if (pa) flags.price.push({ id: p.id, name: p.name, flag: pa, price: p.price });
    const imgs = parseImages(p.images);
    if (!imgs.length) flags.noImages.push({ id: p.id, name: p.name });
    const ii = imageIssues(imgs);
    if (ii.length) flags.images.push({ id: p.id, name: p.name, issues: ii });
    if (p.name === p.name.toUpperCase() && p.name.length > 8) {
      flags.caps.push({ id: p.id, name: p.name });
    }
    if (/factory\s*direct|best\s*seller|high\s*quality|wholesale/i.test(p.name + (p.shortDescription || ""))) {
      flags.factorySpeak.push({ id: p.id, name: p.name });
    }
  }

  const dupeClusters = [...byBase.entries()]
    .filter(([, list]) => list.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([base, list]) => ({
      base,
      count: list.length,
      keepHint: list
        .slice()
        .sort(
          (a, b) =>
            (b.qualityScore ?? 0) - (a.qualityScore ?? 0) ||
            parseImages(b.images).length - parseImages(a.images).length ||
            a.price - b.price
        )
        .slice(0, 3)
        .map((p) => ({
          id: p.id,
          name: p.name,
          q: p.qualityScore,
          imgs: parseImages(p.images).length,
          price: p.price,
        })),
    }));

  const byCat: Record<string, number> = {};
  for (const p of products) {
    const c = p.category || "Ukjent";
    byCat[c] = (byCat[c] || 0) + 1;
  }

  const report = {
    active: products.length,
    byCat,
    flagCounts: {
      unpublish: flags.unpublish.length,
      numberedTitle: flags.numberedTitle.length,
      badShort: flags.badShort.length,
      needDesc: flags.needDesc.length,
      catMove: flags.catMove.length,
      price: flags.price.length,
      images: flags.images.length,
      noImages: flags.noImages.length,
      caps: flags.caps.length,
      factorySpeak: flags.factorySpeak.length,
      dupeClusters: dupeClusters.length,
      productsInDupeClusters3plus: dupeClusters.reduce((s, c) => s + c.count, 0),
      badVariantNames: badVariantNames.length,
    },
    topDupeClusters: dupeClusters.slice(0, 25),
    sampleNumbered: flags.numberedTitle.slice(0, 30),
    sampleBadShort: flags.badShort.slice(0, 25),
    sampleUnpublish: flags.unpublish.slice(0, 30),
    sampleCatMove: flags.catMove.slice(0, 20),
    samplePrice: flags.price.slice(0, 15),
    sampleFactory: flags.factorySpeak.slice(0, 15),
    sampleBadVariants: badVariantNames.slice(0, 40),
  };

  const out = path.join(process.cwd(), "tmp", "merch-hom-probe.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ out, ...report.flagCounts, active: report.active, byCat }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
