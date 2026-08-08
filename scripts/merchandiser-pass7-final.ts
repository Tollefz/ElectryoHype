import { PrismaClient } from "@prisma/client";
import slugify from "slugify";
import {
  buildMetaDescription,
  buildMetaTitle,
  norwegianShortDescription,
} from "../lib/merchandiser/full-catalog-pass";

const prisma = new PrismaClient();

const fixes: Array<[RegExp, string]> = [
  [/ergonomic.*wrist|wrist\s*rest/i, "Ergonomisk håndleddsstøtte"],
  [/multimedia.*tastatur.*remote|remote\s*control/i, "Trådløst tastatur og mus"],
  [/eight-core|android\s*13\s*system/i, "Android-nettbrett 8 tommer"],
];

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
  let n = 0;
  for (const p of all) {
    for (const [re, title] of fixes) {
      if (re.test(p.name) && p.name !== title) {
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
        n += 1;
        break;
      }
    }
  }

  const active = await prisma.product.count({ where: { isActive: true } });
  const inactive = await prisma.product.count({ where: { isActive: false } });
  const cats = await prisma.category.findMany({
    select: { id: true, name: true },
  });
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  const withCat = await prisma.product.findMany({
    where: { isActive: true },
    select: { categoryId: true, name: true },
  });
  const categories: Record<string, number> = {};
  for (const p of withCat) {
    const key = catMap[p.categoryId] ?? p.categoryId;
    categories[key] = (categories[key] ?? 0) + 1;
  }

  const counts = new Map<string, number>();
  for (const { name } of withCat) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const dupes = [...counts.entries()]
    .filter(([, c]) => c >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const englishish = withCat
    .map((p) => p.name)
    .filter((n) =>
      /\b(for|with|and|wireless|gaming|keyboard|mouse|charger)\b/i.test(n)
    )
    .slice(0, 20);

  console.log(
    JSON.stringify(
      {
        extraFixed: n,
        active,
        inactive,
        removedTotal: inactive,
        categories,
        duplicateTitlesTop: dupes,
        englishishSample: englishish,
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
