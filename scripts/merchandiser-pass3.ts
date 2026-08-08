/**
 * Pass 3: unpublish new soft rejects + force hybrid title cleanup.
 */
import { PrismaClient } from "@prisma/client";
import slugify from "slugify";
import {
  decideUnpublish,
  norwegianRetailTitle,
  norwegianShortDescription,
  buildMetaTitle,
  buildMetaDescription,
  needsDescriptionRewrite,
  type MerchProduct,
} from "@/lib/merchandiser/full-catalog-pass";
import { looksLikeEnglishTitle } from "@/lib/import/norwegian-title";

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
  const products = (await prisma.product.findMany({
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
  })) as MerchProduct[];

  let unpublished = 0;
  let titles = 0;
  const still: string[] = [];

  for (const p of products) {
    const reject = decideUnpublish(p);
    if (reject) {
      await prisma.product.update({
        where: { id: p.id },
        data: { isActive: false, buyerLifecycle: "discontinued" },
      });
      unpublished += 1;
      continue;
    }

    if (!looksLikeEnglishTitle(p.name) && !looksLikeEnglishTitle(p.metaTitle)) {
      continue;
    }

    const title = norwegianRetailTitle(p.name);
    if (!title) continue;
    const short = needsDescriptionRewrite(p)
      ? norwegianShortDescription(p, title)
      : p.shortDescription;
    const desired = slugify(title, { lower: true, strict: true, locale: "nb" })
      .replace(/-+/g, "-")
      .slice(0, 70);
    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: title,
        slug: await uniqueSlug(desired || p.slug, p.id),
        metaTitle: buildMetaTitle(title),
        metaDescription: buildMetaDescription(title, short || title),
        ...(short ? { shortDescription: short } : {}),
      },
    });
    titles += 1;
    if (looksLikeEnglishTitle(title)) still.push(`${title}`);
  }

  const active = await prisma.product.count({ where: { isActive: true } });
  const eng = (
    await prisma.product.findMany({
      where: { isActive: true },
      select: { name: true },
    })
  ).filter((x) => looksLikeEnglishTitle(x.name));

  console.log(
    JSON.stringify(
      {
        unpublished,
        titlesFixed: titles,
        active,
        englishRemaining: eng.length,
        sampleEnglish: eng.slice(0, 15).map((e) => e.name),
        stillAfterForce: still.slice(0, 10),
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
