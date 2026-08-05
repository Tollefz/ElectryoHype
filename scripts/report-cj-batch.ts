import { prisma } from "../lib/prisma";

async function main() {
  const queue = await prisma.importQueueItem.groupBy({
    by: ["status"],
    _count: true,
  });
  const products = await prisma.product.findMany({
    where: { supplierName: "cj" },
    select: {
      id: true,
      name: true,
      stock: true,
      videos: true,
      supplierSpecs: true,
      supplierRaw: true,
      importCompleteness: true,
      _count: { select: { variants: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("queue", queue);
  console.log("cj products", products.length);

  let withVideo = 0;
  let noVideo = 0;
  let noSpecs = 0;
  let noVariants = 0;
  let multiVariant = 0;
  let scores: number[] = [];

  for (const p of products) {
    const c = (p.importCompleteness || {}) as { score?: number };
    const specs = (p.supplierSpecs || {}) as Record<string, unknown>;
    const videos = Array.isArray(p.videos) ? p.videos : [];
    const specCount = Object.keys(specs).length;
    if (videos.length > 0) withVideo++;
    else noVideo++;
    if (specCount === 0) noSpecs++;
    if (p._count.variants === 0) noVariants++;
    if (p._count.variants > 1) multiVariant++;
    if (typeof c.score === "number") scores.push(c.score);
    console.log(
      [
        p.id.slice(0, 8),
        `v${p._count.variants}`,
        `specs=${specCount}`,
        `vid=${videos.length}`,
        `stock=${p.stock}`,
        `raw=${p.supplierRaw ? "yes" : "NO"}`,
        `score=${c.score ?? "?"}`,
        p.name.slice(0, 48),
      ].join(" | ")
    );
  }

  console.log("--- diversity ---");
  console.log({
    withVideo,
    noVideo,
    noSpecs,
    noVariants,
    multiVariant,
    minScore: Math.min(...scores),
    maxScore: Math.max(...scores),
    avgScore: scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
