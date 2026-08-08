/**
 * Senior Merchandiser — full catalog pass over ALL active products.
 *
 * - Unpublish off-DNA / AliExpress-random
 * - Norwegian retail titles + meta
 * - Better short descriptions
 * - Category corrections
 * - Spec cleanup
 * - Price / image anomaly reporting
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/merchandiser-full-catalog-pass.ts
 *   npx tsx -r dotenv/config scripts/merchandiser-full-catalog-pass.ts --dry-run
 *   npx tsx -r dotenv/config scripts/merchandiser-full-catalog-pass.ts --ai
 */

import { PrismaClient, Prisma } from "@prisma/client";
import slugify from "slugify";
import fs from "fs";
import path from "path";
import {
  type MerchProduct,
  decideUnpublish,
  suggestCategory,
  parseImages,
  imageIssues,
  priceAnomaly,
  norwegianRetailTitle,
  norwegianShortDescription,
  needsDescriptionRewrite,
  cleanSpecs,
  buildMetaTitle,
  buildMetaDescription,
} from "@/lib/merchandiser/full-catalog-pass";
import { looksLikeEnglishTitle } from "@/lib/import/norwegian-title";
import { cleanProductName } from "@/lib/utils/url-decode";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const useAi = process.argv.includes("--ai");

type Report = {
  analyzed: number;
  unpublished: Array<{ id: string; name: string; reason: string }>;
  titlesImproved: number;
  descriptionsImproved: number;
  categoriesMoved: Array<{ id: string; from: string | null; to: string; name: string }>;
  specsCleaned: number;
  seoImproved: number;
  imageFlags: Array<{ id: string; name: string; issues: string[] }>;
  priceFlags: Array<{ id: string; name: string; flag: string; price: number }>;
  stillEnglish: Array<{ id: string; name: string; title: string }>;
  aiEnriched: number;
  errors: string[];
};

function makeSlug(title: string, id: string): string {
  const base = slugify(title, { lower: true, strict: true, locale: "nb" })
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return base || `produkt-${id.slice(-8)}`;
}

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

async function maybeAiTitle(
  p: MerchProduct
): Promise<{ name: string; short: string; metaDesc: string } | null> {
  if (!useAi || !process.env.OPENAI_API_KEY?.trim()) return null;
  try {
    const { enrichProductWithAI, enrichmentToShortDescription } = await import(
      "@/lib/import/ai-enrichment"
    );
    const imgs = parseImages(p.images);
    const { enrichment, aiGenerated } = await enrichProductWithAI({
      title: p.name,
      description: p.description || p.shortDescription || "",
      category: p.category || undefined,
      images: imgs.slice(0, 3),
    });
    if (!aiGenerated) return null;
    return {
      name: enrichment.title || norwegianRetailTitle(p.name),
      short: enrichmentToShortDescription(enrichment),
      metaDesc: enrichment.metaDescription || buildMetaDescription(enrichment.title, enrichment.shortIntroduction),
    };
  } catch (e) {
    console.warn("[ai]", p.id, e instanceof Error ? e.message : e);
    return null;
  }
}

async function main() {
  const report: Report = {
    analyzed: 0,
    unpublished: [],
    titlesImproved: 0,
    descriptionsImproved: 0,
    categoriesMoved: [],
    specsCleaned: 0,
    seoImproved: 0,
    imageFlags: [],
    priceFlags: [],
    stillEnglish: [],
    aiEnriched: 0,
    errors: [],
  };

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "write",
        ai: useAi && Boolean(process.env.OPENAI_API_KEY?.trim()),
      },
      null,
      2
    )
  );

  const batchSize = 100;
  let cursor: string | undefined;

  for (;;) {
    const batch: MerchProduct[] = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        name: true,
        slug: true,
        metaTitle: true,
        metaDescription: true,
        shortDescription: true,
        description: true,
        category: true,
        price: true,
        compareAtPrice: true,
        images: true,
        specs: true,
        tags: true,
        supplierPrice: true,
      },
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const p of batch) {
      report.analyzed += 1;
      try {
        const reject = decideUnpublish(p);
        if (reject) {
          report.unpublished.push({
            id: p.id,
            name: p.name,
            reason: reject.reason,
          });
          if (!dryRun) {
            await prisma.product.update({
              where: { id: p.id },
              data: {
                isActive: false,
                buyerLifecycle: "discontinued",
              },
            });
          }
          continue;
        }

        const imgs = parseImages(p.images);
        const imgIss = imageIssues(imgs);
        if (imgIss.length) {
          report.imageFlags.push({ id: p.id, name: p.name, issues: imgIss });
        }

        const priceFlag = priceAnomaly(p);
        if (priceFlag) {
          report.priceFlags.push({
            id: p.id,
            name: p.name,
            flag: priceFlag,
            price: p.price,
          });
        }

        const data: Prisma.ProductUpdateInput = {};
        let title = cleanProductName(p.name);
        const english = looksLikeEnglishTitle(title);

        if (english || looksLikeEnglishTitle(p.metaTitle)) {
          const ai = await maybeAiTitle(p);
          if (ai) {
            title = ai.name;
            data.name = title;
            data.shortDescription = ai.short;
            data.metaTitle = buildMetaTitle(title);
            data.metaDescription = ai.metaDesc;
            report.aiEnriched += 1;
            report.titlesImproved += 1;
            report.descriptionsImproved += 1;
            report.seoImproved += 1;
          } else {
            const next = norwegianRetailTitle(p.name);
            if (next && next !== p.name) {
              title = next;
              data.name = next;
              report.titlesImproved += 1;
            }
          }
        }

        if (needsDescriptionRewrite(p) && !data.shortDescription) {
          const short = norwegianShortDescription(p, title);
          data.shortDescription = short;
          // Light description body if empty/generic
          if (!p.description || needsDescriptionRewrite(p)) {
            data.description = [
              short,
              "",
              "Produktet leveres klart til bruk. Se spesifikasjoner for detaljer.",
              "Fri frakt over 500 kr. Levering 5–12 virkedager. 30 dagers åpent kjøp.",
            ].join("\n");
          }
          report.descriptionsImproved += 1;
        }

        const newCat = suggestCategory({ ...p, name: title });
        if (newCat) {
          data.category = newCat;
          report.categoriesMoved.push({
            id: p.id,
            from: p.category,
            to: newCat,
            name: title,
          });
        }

        const cleaned = cleanSpecs(p.specs);
        if (cleaned) {
          const before = JSON.stringify(p.specs);
          const after = JSON.stringify(cleaned);
          if (before !== after) {
            data.specs = cleaned;
            report.specsCleaned += 1;
          }
        }

        // SEO
        const metaTitle = buildMetaTitle(title);
        const metaDesc = buildMetaDescription(
          title,
          (data.shortDescription as string) || p.shortDescription || title
        );
        if (
          !p.metaTitle ||
          looksLikeEnglishTitle(p.metaTitle) ||
          p.metaTitle.includes("ElectroHypeX | ElectroHypeX")
        ) {
          data.metaTitle = metaTitle;
          report.seoImproved += 1;
        }
        if (!p.metaDescription || looksLikeEnglishTitle(p.metaDescription) || p.metaDescription.length < 40) {
          data.metaDescription = metaDesc;
          if (!data.metaTitle) report.seoImproved += 1;
        }

        // Slug only when title changed significantly
        if (typeof data.name === "string" && data.name !== p.name) {
          const desired = makeSlug(data.name, p.id);
          if (desired !== p.slug) {
            data.slug = await uniqueSlug(desired, p.id);
          }
        }

        if (Object.keys(data).length > 0 && !dryRun) {
          await prisma.product.update({ where: { id: p.id }, data });
        }

        const finalTitle = (data.name as string) || title;
        if (looksLikeEnglishTitle(finalTitle)) {
          report.stillEnglish.push({
            id: p.id,
            name: p.name,
            title: finalTitle,
          });
        }
      } catch (e) {
        report.errors.push(
          `${p.id}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    console.log(`… processed ${report.analyzed} (cursor ${cursor})`);
  }

  const outDir = path.join(process.cwd(), "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "merchandiser-catalog-pass-report.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        ...report,
        unpublishedCount: report.unpublished.length,
        categoriesMovedCount: report.categoriesMoved.length,
        imageFlagsCount: report.imageFlags.length,
        priceFlagsCount: report.priceFlags.length,
        stillEnglishCount: report.stillEnglish.length,
        dryRun,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        analyzed: report.analyzed,
        unpublished: report.unpublished.length,
        titlesImproved: report.titlesImproved,
        descriptionsImproved: report.descriptionsImproved,
        categoriesMoved: report.categoriesMoved.length,
        specsCleaned: report.specsCleaned,
        seoImproved: report.seoImproved,
        imageFlags: report.imageFlags.length,
        priceFlags: report.priceFlags.length,
        stillEnglish: report.stillEnglish.length,
        aiEnriched: report.aiEnriched,
        errors: report.errors.length,
        reportFile: outPath,
        sampleUnpublish: report.unpublished.slice(0, 15),
        sampleMoved: report.categoriesMoved.slice(0, 10),
        sampleStillEnglish: report.stillEnglish.slice(0, 10),
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
