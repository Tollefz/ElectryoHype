import { PrismaClient } from "@prisma/client";
import slugify from "slugify";
import {
  buildMetaDescription,
  buildMetaTitle,
  norwegianRetailTitle,
  norwegianShortDescription,
} from "../lib/merchandiser/full-catalog-pass";

const prisma = new PrismaClient();

function isStillSupplierEnglish(name: string): boolean {
  const enHits = (
    name.match(
      /\b(with|and|for|membrane|light|remote|control|charger|keyboard|mouse|wireless|earphone|standby|compatible|portable|adjustable|universal|desktop|mount|bracket|function|system|rechargeable|electric|hand|warmer|double|side|heating|rgb|mini|ultra|fast|charge|power|bank|headset|bluetooth|gaming)\b/gi
    ) || []
  ).length;
  if (/\b(membrane|remote control|standby|compatible with|adjustable universal|earphone|hand warmer)\b/i.test(name)) {
    return true;
  }
  // Hybrid: Norwegian stem + leftover English tokens
  const leftover = (
    name.match(
      /\b(with|and|for|membrane|light|remote|control|charger|keyboard|mouse|wireless|earphone|standby|compatible|portable|adjustable|universal|desktop|mount|bracket|function|system|rechargeable|electric|warmer|heating)\b/gi
    ) || []
  ).length;
  return leftover >= 2 || (leftover >= 1 && /RGB|Light|Mini|Membrane/i.test(name));
}

async function uniqueSlug(base: string, excludeId: string) {
  let slug = slugify(base, { lower: true, strict: true, locale: "nb" }).slice(0, 70);
  let i = 0;
  while (
    await prisma.product.findFirst({
      where: { slug, id: { not: excludeId } },
      select: { id: true },
    })
  ) {
    i += 1;
    slug =
      slugify(base, { lower: true, strict: true, locale: "nb" }).slice(0, 65) +
      "-" +
      i;
  }
  return slug;
}

async function main() {
  const all = await prisma.product.findMany({ where: { isActive: true } });
  const bad = all.filter((p) => isStillSupplierEnglish(p.name));
  console.log("supplierEnglishBefore", bad.length);
  console.log("samples", bad.slice(0, 25).map((p) => p.name));

  let fixed = 0;
  for (const p of bad) {
    const title = norwegianRetailTitle(p.name);
    if (!title || title === p.name) continue;
    if (isStillSupplierEnglish(title) && title.length > 40) {
      // force shorter retail type names for stubborn hybrids
      continue;
    }
    const short = norwegianShortDescription(p, title);
    const slug = await uniqueSlug(title, p.id);
    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: title,
        slug,
        metaTitle: buildMetaTitle(title),
        metaDescription: buildMetaDescription(title, short),
        shortDescription: short,
      },
    });
    fixed += 1;
  }

  const after = await prisma.product.findMany({
    where: { isActive: true },
    select: { name: true },
  });
  const still = after.filter((p) => isStillSupplierEnglish(p.name));
  console.log(
    JSON.stringify(
      {
        fixed,
        stillAfter: still.length,
        stillSamples: still.slice(0, 20).map((p) => p.name),
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
