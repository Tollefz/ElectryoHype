import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const active = await prisma.product.count({ where: { isActive: true } });
  const inactive = await prisma.product.count({ where: { isActive: false } });
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      name: true,
      category: true,
      shortDescription: true,
      metaTitle: true,
      images: true,
      price: true,
      compareAtPrice: true,
    },
  });

  const categories: Record<string, number> = {};
  const nameCounts = new Map<string, number>();
  let englishish = 0;
  const englishSamples: string[] = [];
  let missingImage = 0;
  let badCompare = 0;

  for (const p of products) {
    const cat = p.category?.trim() || "Ukjent";
    categories[cat] = (categories[cat] ?? 0) + 1;
    nameCounts.set(p.name, (nameCounts.get(p.name) ?? 0) + 1);
    if (
      /\b(for|with|and|wireless|gaming|keyboard|mouse|charger|remote|control)\b/i.test(
        p.name
      )
    ) {
      englishish += 1;
      if (englishSamples.length < 15) englishSamples.push(p.name);
    }
    const imgs = (() => {
      try {
        const j = JSON.parse(p.images || "[]");
        return Array.isArray(j) ? j : [];
      } catch {
        return p.images ? [p.images] : [];
      }
    })();
    if (!imgs.length || !String(imgs[0] || "").trim()) missingImage += 1;
    if (
      p.compareAtPrice != null &&
      p.compareAtPrice > 0 &&
      p.price > 0 &&
      p.compareAtPrice < p.price
    ) {
      badCompare += 1;
    }
  }

  const dupes = [...nameCounts.entries()]
    .filter(([, c]) => c >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const unpublished = await prisma.product.findMany({
    where: { isActive: false },
    select: { name: true },
    take: 30,
    orderBy: { updatedAt: "desc" },
  });

  // Reason buckets from name heuristics on inactive
  const allInactive = await prisma.product.findMany({
    where: { isActive: false },
    select: { name: true },
  });
  const reasons: Record<string, number> = {
    Musikkinstrument: 0,
    Kjæledyr: 0,
    "Bil / jump starter": 0,
    "Kjøkken / hvitevarer": 0,
    "Undervisning / pager": 0,
    "Møbler / desk": 0,
    "Telefon / unlocked": 0,
    "AliExpress-tilfeldig / annet": 0,
  };
  for (const { name } of allInactive) {
    const n = name.toLowerCase();
    if (/piano|midi|keyboard bench|keyboard stand|keyboard stool/.test(n))
      reasons["Musikkinstrument"] += 1;
    else if (/cat toy|pet |dog |squirrel/.test(n)) reasons["Kjæledyr"] += 1;
    else if (/jump start|jumper|booster|tire inflat|car battery/.test(n))
      reasons["Bil / jump starter"] += 1;
    else if (/restaurant|pager|mosquito|repellent|kitchen|scrubber/.test(n))
      reasons["Kjøkken / hvitevarer"] += 1;
    else if (/teaching|laser pointer|flying squirrel|pen-shaped/.test(n))
      reasons["Undervisning / pager"] += 1;
    else if (/desk|furniture|bench|stool|chair/.test(n) && !/gaming/.test(n))
      reasons["Møbler / desk"] += 1;
    else if (/unlocked|smartphone|5g.*ram/.test(n))
      reasons["Telefon / unlocked"] += 1;
    else reasons["AliExpress-tilfeldig / annet"] += 1;
  }

  console.log(
    JSON.stringify(
      {
        active,
        inactive,
        categories,
        duplicateTitlesTop: dupes,
        englishishCount: englishish,
        englishSamples,
        missingImage,
        badCompare,
        unpublishedReasons: reasons,
        recentUnpublished: unpublished.map((p) => p.name),
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
