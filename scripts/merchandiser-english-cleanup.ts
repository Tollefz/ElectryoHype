/**
 * Second pass: only remaining English titles among active products.
 */
import { PrismaClient } from "@prisma/client";
import slugify from "slugify";
import { looksLikeEnglishTitle } from "@/lib/import/norwegian-title";
import {
  norwegianRetailTitle,
  norwegianShortDescription,
  buildMetaTitle,
  buildMetaDescription,
  needsDescriptionRewrite,
} from "@/lib/merchandiser/full-catalog-pass";

const prisma = new PrismaClient();

async function uniqueSlug(desired: string, productId: string): Promise<string> {
  let slug = desired;
  let n = 0;
  while (true) {
    const clash = await prisma.product.findFirst({
      where: { slug, id: { not: productId } },
      select: { id: true },
    });
    if (!clash) return slug;
    n += 1;
    slug = `${desired.slice(0, 60)}-${n}`;
  }
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
      tags: true,
      price: true,
      compareAtPrice: true,
      images: true,
      specs: true,
      supplierPrice: true,
    },
  });

  let fixed = 0;
  const left: string[] = [];

  for (const p of products) {
    if (!looksLikeEnglishTitle(p.name) && !looksLikeEnglishTitle(p.metaTitle)) {
      continue;
    }
    const title = norwegianRetailTitle(p.name);
    if (!title || title === p.name) {
      if (looksLikeEnglishTitle(title || p.name)) left.push(`${p.id} | ${p.name}`);
      continue;
    }
    const short = needsDescriptionRewrite(p)
      ? norwegianShortDescription(p, title)
      : p.shortDescription;
    const desired = slugify(title, { lower: true, strict: true, locale: "nb" })
      .replace(/-+/g, "-")
      .slice(0, 70);
    const slug = await uniqueSlug(desired || p.slug, p.id);
    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: title,
        slug,
        metaTitle: buildMetaTitle(title),
        metaDescription: buildMetaDescription(title, short || title),
        ...(short ? { shortDescription: short } : {}),
      },
    });
    fixed += 1;
  }

  console.log(
    JSON.stringify(
      {
        scanned: products.length,
        fixed,
        stillEnglish: left.length,
        sampleLeft: left.slice(0, 20),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
