import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const broken = await prisma.product.findMany({
    where: { name: "[object Object]" },
    select: {
      id: true,
      metaTitle: true,
      shortDescription: true,
      slug: true,
      supplierProductId: true,
      tags: true,
      description: true,
    },
  });
  console.log("count", broken.length);
  console.log(JSON.stringify(broken.slice(0, 3), null, 2));

  const ids = broken.map((b) => b.id);
  if (ids.length) {
    const vers = await prisma.productCatalogVersion.findMany({
      where: { productId: { in: ids } },
      orderBy: { createdAt: "asc" },
      take: 40,
    });
    for (const v of vers.slice(0, 15)) {
      const payload = v.payload as Record<string, unknown> | null;
      console.log({
        productId: v.productId,
        kind: v.kind,
        source: v.source,
        name: payload?.name ?? payload?.title ?? null,
        summary: v.summary,
      });
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
