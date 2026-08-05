import { prisma } from "../lib/prisma";
import { processImportQueueItem } from "../lib/suppliers/import-queue";

async function main() {
  const failed = await prisma.importQueueItem.findMany({
    where: { status: "failed" },
    select: { id: true, supplierProductId: true, error: true },
    take: 20,
  });
  console.log("failed count", failed.length);
  for (const item of failed) {
    console.log("reprocessing", item.id, item.supplierProductId);
    console.log("prev error:", item.error?.slice(0, 200));
    try {
      const result = await processImportQueueItem(item.id);
      console.log("result", result);
    } catch (e) {
      console.error("reprocess error", e);
    }
  }

  const counts = await prisma.importQueueItem.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("queue statuses", counts);
  const products = await prisma.product.count({
    where: { supplierName: "cjdropshipping" },
  });
  console.log("cj products", products);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
