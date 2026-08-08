import { PrismaClient } from "@prisma/client";
import slugify from "slugify";
import {
  buildMetaDescription,
  buildMetaTitle,
  decideUnpublish,
  norwegianRetailTitle,
  norwegianShortDescription,
} from "../lib/merchandiser/full-catalog-pass";

const prisma = new PrismaClient();

const EXTRA_DROP =
  /rose\s*flower|valentine|glass\s*cover|ragdoll|wine\s*glass|bicycle\s*light|bike\s*light|note\s*board|holiday.*pen|water\s*ripple|home\s*decor|net\s*celebrity|hand\s*warmer|selfie\s*fill|flip\s*phone|dual\s*card\s*standby|2g\s*mobile/i;

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

async function recoverOriginalName(productId: string): Promise<string | null> {
  const snap = await prisma.productCatalogVersion.findFirst({
    where: {
      productId,
      OR: [{ kind: "snapshot" }, { summary: "supplierSnapshot" }],
    },
    orderBy: { createdAt: "asc" },
  });
  const payload = snap?.payload as Record<string, unknown> | null;
  const name = payload?.name ?? payload?.title;
  if (typeof name === "string" && name.trim() && !/object Object/i.test(name)) {
    return name.trim();
  }

  const full = await prisma.productCatalogVersion.findFirst({
    where: { productId, kind: "full" },
    orderBy: { createdAt: "asc" },
  });
  const fp = full?.payload as Record<string, unknown> | null;
  const nested = fp?.product as Record<string, unknown> | undefined;
  const n2 = fp?.name ?? nested?.name;
  if (typeof n2 === "string" && n2.trim() && !/object Object/i.test(n2)) {
    return n2.trim();
  }
  return null;
}

async function main() {
  const broken = await prisma.product.findMany({
    where: {
      OR: [{ name: "[object Object]" }, { name: { contains: "[object Object]" } }],
    },
  });

  let fixed = 0;
  let unpublished = 0;

  for (const p of broken) {
    const original = await recoverOriginalName(p.id);
    if (!original) {
      await prisma.product.update({
        where: { id: p.id },
        data: { isActive: false, buyerLifecycle: "discontinued" },
      });
      unpublished += 1;
      console.log("no-original → unpublish", p.id);
      continue;
    }

    if (EXTRA_DROP.test(original) || decideUnpublish({ ...p, name: original } as never)) {
      await prisma.product.update({
        where: { id: p.id },
        data: {
          name: norwegianRetailTitle(original) || original.slice(0, 58),
          isActive: false,
          buyerLifecycle: "discontinued",
        },
      });
      unpublished += 1;
      console.log("off-dna → unpublish", original.slice(0, 70));
      continue;
    }

    const title = norwegianRetailTitle(original);
    if (!title || /object Object/i.test(title)) {
      await prisma.product.update({
        where: { id: p.id },
        data: { isActive: false, buyerLifecycle: "discontinued" },
      });
      unpublished += 1;
      continue;
    }

    const short = norwegianShortDescription({ ...p, name: original } as never, title);
    const slug = await uniqueSlug(title, p.id);
    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: title,
        slug,
        metaTitle: buildMetaTitle(title),
        metaDescription: buildMetaDescription(title, short),
        shortDescription: short,
        isActive: true,
      },
    });
    fixed += 1;
    console.log("fixed", original.slice(0, 50), "→", title);
  }

  const still = await prisma.product.count({ where: { name: "[object Object]" } });
  const active = await prisma.product.count({ where: { isActive: true } });
  const inactive = await prisma.product.count({ where: { isActive: false } });
  console.log(JSON.stringify({ fixed, unpublished, stillBroken: still, active, inactive }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
