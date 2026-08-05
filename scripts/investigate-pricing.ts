import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const temuTotal = await prisma.product.count({ where: { supplierName: "temu" } });
  const around105 = await prisma.product.count({
    where: { supplierName: "temu", supplierPrice: { gte: 100, lte: 110 } },
  });
  const exactFallback = await prisma.product.count({
    where: {
      supplierName: "temu",
      OR: [
        { supplierPrice: { gte: 104.5, lte: 105.5 } },
        { supplierPrice: { gte: 9.99 * 10.5 - 0.5, lte: 9.99 * 10.5 + 0.5 } },
      ],
    },
  });

  console.log(
    JSON.stringify(
      {
        temuTotal,
        supplierPrice_100_to_110: around105,
        exact_9_99_usd_fallback_converted: exactFallback,
        fallbackFormula: "9.99 USD * 10.5 = " + 9.99 * 10.5,
      },
      null,
      2
    )
  );

  const sample = await prisma.product.findMany({
    where: { supplierName: "temu" },
    select: {
      name: true,
      price: true,
      supplierPrice: true,
      compareAtPrice: true,
      supplierUrl: true,
      supplierProductId: true,
      profitMargin: true,
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  for (const p of sample) {
    const cost = p.supplierPrice ?? 0;
    const markup = cost > 0 ? ((p.price - cost) / cost) * 100 : null;
    console.log(
      JSON.stringify({
        name: p.name.slice(0, 70),
        temuUrl: p.supplierUrl,
        goodsId: p.supplierProductId,
        dbSupplierPrice: p.supplierPrice,
        dbSalePrice: p.price,
        compareAt: p.compareAtPrice,
        profitMarginField: p.profitMargin,
        markupPct: markup != null ? Math.round(markup) : null,
        looksLikeFallback105:
          p.supplierPrice != null && Math.abs(p.supplierPrice - 104.895) < 1,
      })
    );
  }

  const all = await prisma.product.findMany({
    where: { supplierName: "temu", supplierPrice: { not: null } },
    select: { supplierPrice: true },
  });
  const buckets: Record<string, number> = {};
  for (const p of all) {
    const sp = Number(p.supplierPrice);
    const key =
      sp <= 30
        ? "0-30"
        : sp <= 60
          ? "31-60"
          : sp <= 90
            ? "61-90"
            : sp <= 120
              ? "91-120"
              : sp <= 200
                ? "121-200"
                : "200+";
    buckets[key] = (buckets[key] || 0) + 1;
  }
  console.log("supplier_hist", buckets);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
