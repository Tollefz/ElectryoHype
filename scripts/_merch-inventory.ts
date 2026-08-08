/**
 * One-shot catalog inventory for Senior Merchandiser pass.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const active = await prisma.product.count({ where: { isActive: true } });
  const inactive = await prisma.product.count({ where: { isActive: false } });
  const byCat = await prisma.product.groupBy({
    by: ["category"],
    where: { isActive: true },
    _count: { _all: true },
  });
  const sample = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      metaTitle: true,
      category: true,
      price: true,
      compareAtPrice: true,
      images: true,
      shortDescription: true,
    },
    take: 5,
    orderBy: { updatedAt: "desc" },
  });
  console.log(
    JSON.stringify(
      {
        active,
        inactive,
        byCat: byCat
          .map((c) => ({ c: c.category, n: c._count._all }))
          .sort((a, b) => b.n - a.n),
        sample,
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
