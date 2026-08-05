import { createCsvCatalogProvider } from "../lib/suppliers/csv/provider";
import { runSupplierWorkers } from "../lib/suppliers/workers/jobs";
import { prisma } from "../lib/prisma";

async function main() {
  const csv = createCsvCatalogProvider();
  console.log("configured", await csv.isConfigured());
  const search = await csv.searchProducts({ pageSize: 10 });
  console.log(
    "search",
    search.total,
    search.products.map((p) => p.id)
  );
  const imported = await csv.importProducts(
    search.products.map((p) => p.id),
    { createdByEmail: "fase3@test" }
  );
  console.log("enqueued", imported);
  const workers = await runSupplierWorkers({
    concurrency: 2,
    limit: 10,
    types: ["import_item"],
  });
  console.log("workers", workers);
  const items = await prisma.importQueueItem.findMany({
    where: { supplier: "csv" },
    select: {
      id: true,
      status: true,
      autoApproved: true,
      reviewReason: true,
      productId: true,
      supplierAccountId: true,
      rawArtifactId: true,
    },
  });
  console.log("queue", JSON.stringify(items, null, 2));
  const products = await prisma.product.findMany({
    where: { supplierName: "csv" },
    select: {
      id: true,
      name: true,
      catalogVersion: true,
      supplierAccountId: true,
      supplierRawArtifactId: true,
      isActive: true,
    },
  });
  console.log("products", products);
  const versions = await prisma.productCatalogVersion.count({
    where: { productId: { in: products.map((p) => p.id) } },
  });
  console.log("versions", versions);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
