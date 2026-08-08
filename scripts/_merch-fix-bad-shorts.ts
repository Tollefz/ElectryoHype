/**
 * Fix remaining mismatched short descriptions on active catalog.
 * npx tsx -r dotenv/config scripts/_merch-fix-bad-shorts.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  buildMetaDescription,
  buildMetaTitle,
  norwegianShortDescription,
  type MerchProduct,
} from "../lib/merchandiser/full-catalog-pass";

const prisma = new PrismaClient();

function isBad(name: string, short: string | null): boolean {
  if (!short || short.trim().length < 20) return true;
  const n = name.toLowerCase();
  const s = short.toLowerCase();
  if (/musematte|skrivebordsmatte/.test(n) && /\bmusen\b|dpi\b|gjør musen/.test(s)) return true;
  if (/tastatur|keyboard/.test(n) && /gjør musen/.test(s)) return true;
  if (/høyttaler|hoyttaler/.test(n) && /chargers?|kategori:\s*chargers/.test(s)) return true;
  if (/\b(ruter|router|wifi)\b/.test(n) && /iphone|3\.5\s*mm|kompatibilitet:\s*iphone/.test(s))
    return true;
  if (/webkamera/.test(n) && /gjør musen|tastatur/.test(s)) return true;
  if (/lader|powerbank/.test(n) && /gjør musen|musematte/.test(s)) return true;
  if (/tilkobling:\s*bluetooth\.\s*vekt:.*kategori:/i.test(s)) return true;
  if (/pålitelig lading med stabil/i.test(s)) return true;
  return false;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      shortDescription: true,
      description: true,
      category: true,
      metaTitle: true,
      metaDescription: true,
      tags: true,
      price: true,
      compareAtPrice: true,
      images: true,
      specs: true,
      slug: true,
      supplierPrice: true,
    },
  });

  let fixed = 0;
  for (const p of products) {
    if (!isBad(p.name, p.shortDescription)) continue;
    // Clear short so helper regenerates (does not keep polluted copy)
    const short = norwegianShortDescription(
      { ...(p as unknown as MerchProduct), shortDescription: "" },
      p.name
    );
    await prisma.product.update({
      where: { id: p.id },
      data: {
        shortDescription: short,
        metaTitle: buildMetaTitle(p.name),
        metaDescription: buildMetaDescription(p.name, short),
      },
    });
    fixed += 1;
  }
  console.log(JSON.stringify({ scanned: products.length, fixed }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
