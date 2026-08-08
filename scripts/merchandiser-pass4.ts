import { PrismaClient } from "@prisma/client";
import { decideUnpublish } from "@/lib/merchandiser/full-catalog-pass";
import { looksLikeEnglishTitle } from "@/lib/import/norwegian-title";
import {
  norwegianRetailTitle,
  buildMetaTitle,
  buildMetaDescription,
  norwegianShortDescription,
} from "@/lib/merchandiser/full-catalog-pass";
import slugify from "slugify";

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({ where: { isActive: true } });
  let unpublished = 0;
  let titles = 0;

  for (const p of products) {
    const reject = decideUnpublish(p as never);
    if (reject) {
      await prisma.product.update({
        where: { id: p.id },
        data: { isActive: false, buyerLifecycle: "discontinued" },
      });
      unpublished += 1;
      continue;
    }
  }

  // Targeted title fixes for remaining clear EN names
  const active = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      metaTitle: true,
      shortDescription: true,
      description: true,
      category: true,
      tags: true,
      price: true,
      compareAtPrice: true,
      images: true,
      specs: true,
      supplierPrice: true,
      metaDescription: true,
    },
  });

  for (const p of active) {
    if (!looksLikeEnglishTitle(p.name)) continue;
    const title = norwegianRetailTitle(p.name);
    // Extra forced maps
    let final = title;
    if (/ring\s*light|selfie\s*tripod/i.test(p.name)) final = "Ringlys med stativ";
    if (/condenser\s*microphone|live\s*recording/i.test(p.name)) final = "Kondensatormikrofon";
    if (/travel\s*adapter|worldwide\s*plug/i.test(p.name)) final = "Reiseadapter verdensplugg";
    if (/subwoofer/i.test(p.name)) final = "Trådløs Bluetooth-høyttaler";
    if (final === p.name && looksLikeEnglishTitle(final)) continue;

    const short = norwegianShortDescription(p as never, final);
    const desired = slugify(final, { lower: true, strict: true, locale: "nb" }).slice(0, 70);
    let slug = desired;
    let n = 0;
    while (
      await prisma.product.findFirst({
        where: { slug, id: { not: p.id } },
        select: { id: true },
      })
    ) {
      n += 1;
      slug = `${desired}-${n}`;
    }
    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: final,
        slug,
        metaTitle: buildMetaTitle(final),
        metaDescription: buildMetaDescription(final, short),
        shortDescription: short,
      },
    });
    titles += 1;
  }

  const finalActive = await prisma.product.findMany({
    where: { isActive: true },
    select: { name: true, category: true },
  });
  const eng = finalActive.filter((x) => looksLikeEnglishTitle(x.name));
  const byCat: Record<string, number> = {};
  for (const x of finalActive) {
    byCat[x.category || "null"] = (byCat[x.category || "null"] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        unpublished,
        titlesFixed: titles,
        active: finalActive.length,
        englishRemaining: eng.length,
        byCat,
        sampleEnglish: eng.slice(0, 12).map((e) => e.name),
        sampleGood: finalActive
          .filter((x) => !looksLikeEnglishTitle(x.name))
          .slice(0, 10)
          .map((e) => e.name),
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
