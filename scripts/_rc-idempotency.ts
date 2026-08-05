/**
 * RC: prove processImportQueueItem does not create duplicate Products.
 */
import { PrismaClient } from "@prisma/client";
import { processImportQueueItem } from "../lib/suppliers/import-queue";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.product.findFirst({
    where: { isActive: true, supplierProductId: { not: null } },
    select: {
      id: true,
      name: true,
      slug: true,
      supplierName: true,
      supplierProductId: true,
      isActive: true,
    },
  });
  if (!existing?.supplierProductId || !existing.supplierName) {
    throw new Error("No active product to test");
  }

  const before = await prisma.product.count({
    where: {
      supplierName: existing.supplierName,
      supplierProductId: existing.supplierProductId,
    },
  });

  // Find or create a queue item for same supplier SKU
  let item = await prisma.importQueueItem.findFirst({
    where: {
      supplier: existing.supplierName,
      supplierProductId: existing.supplierProductId,
    },
  });
  if (!item) {
    item = await prisma.importQueueItem.create({
      data: {
        supplier: existing.supplierName,
        supplierProductId: existing.supplierProductId,
        title: existing.name,
        status: "queued",
        supplierPrice: 1,
        supplierCurrency: "USD",
        mappedDraft: { title: existing.name },
      },
    });
  }

  const result = await processImportQueueItem(item.id);
  const after = await prisma.product.count({
    where: {
      supplierName: existing.supplierName,
      supplierProductId: existing.supplierProductId,
    },
  });

  console.log(
    JSON.stringify(
      {
        productId: existing.id,
        handle: existing.slug,
        beforeCount: before,
        afterCount: after,
        result,
        duplicateCreated: after > before,
        alreadyPublishedFlag: (result as { alreadyPublished?: boolean })
          .alreadyPublished,
      },
      null,
      2
    )
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
