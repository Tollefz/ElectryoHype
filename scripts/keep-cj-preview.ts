/** Import one CJ product and keep the inactive draft for UI preview. */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { createCjCatalogProvider } from "../lib/suppliers/cj/provider";
import { processImportQueueItem } from "../lib/suppliers/import-queue";
import { bulkDeleteProducts } from "../lib/admin/bulk-product-cleanup";
import { ImportQueueStatus } from "@prisma/client";

const PID = "1436966941628698624";

async function main() {
  const existing = await prisma.product.findMany({
    where: { supplierName: "cj", supplierProductId: PID },
    select: { id: true },
  });
  if (existing.length) await bulkDeleteProducts(existing.map((p) => p.id));
  await prisma.importQueueItem.deleteMany({ where: { supplier: "cj", supplierProductId: PID } });

  const provider = createCjCatalogProvider();
  const imported = await provider.importProducts([PID], { createdByEmail: "preview@local" });
  const queueId = imported.queueItemIds[0];
  await prisma.importQueueItem.update({
    where: { id: queueId },
    data: { status: ImportQueueStatus.queued, productId: null },
  });
  const processed = await processImportQueueItem(queueId);
  console.log(
    JSON.stringify({
      queueId,
      productId: processed.productId,
      preview: `/admin/suppliers/import-queue/${queueId}/preview`,
      keep: true,
    })
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
