/**
 * Perfect-pipeline verification for one known CJ product.
 * Usage: NODE_OPTIONS='--require ./scripts/stub-server-only.cjs' npx tsx scripts/sandbox-cj-one-product.ts
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { createCjCatalogProvider } from "../lib/suppliers/cj/provider";
import { fetchCjProduct, extractCjImageUrls } from "../lib/suppliers/cj/mapper";
import { processImportQueueItem } from "../lib/suppliers/import-queue";
import { bulkDeleteProducts } from "../lib/admin/bulk-product-cleanup";
import { prepareImagesDetailed } from "../lib/import/image-quality";
import { ImportQueueStatus } from "@prisma/client";

const PID = process.argv[2] || "1436966941628698624";

function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function main() {
  const provider = createCjCatalogProvider();
  if (!(await provider.isConfigured())) throw new Error("CJ_API_KEY mangler");

  // Force re-import: clear any previous queue/product for this pid
  const existingProducts = await prisma.product.findMany({
    where: { supplierName: "cj", supplierProductId: PID },
    select: { id: true },
  });
  if (existingProducts.length) {
    await bulkDeleteProducts(existingProducts.map((p) => p.id));
  }
  await prisma.importQueueItem.deleteMany({
    where: { supplier: "cj", supplierProductId: PID },
  });

  console.log("1) Fetch CJ source of truth...");
  const source = await fetchCjProduct(PID);
  if (!source) throw new Error("Produkt ikke funnet");

  const rawImages =
    source.raw && typeof source.raw === "object"
      ? extractCjImageUrls(source.raw as Parameters<typeof extractCjImageUrls>[0])
      : source.sourceImages;
  const prepared = prepareImagesDetailed(rawImages);

  console.log(
    JSON.stringify(
      {
        title: source.title,
        sourceImages: rawImages.length,
        preparedImages: prepared.images.length,
        dropped: prepared.dropped.map((d) => ({ reason: d.reason, url: d.originalUrl.slice(0, 80) })),
        variants: source.variants.length,
        specs: Object.keys(source.specifications).length,
        attributes: Object.keys(source.attributes).length,
        videos: source.videos.length,
        stock: source.stock,
        sku: source.sku,
        variantStocks: source.variants.map((v) => ({ sku: v.sku, stock: v.stock })),
      },
      null,
      2
    )
  );

  console.log("2) Enqueue + process (inactive draft)...");
  const imported = await provider.importProducts([PID], {
    createdByEmail: "sandbox@local",
  });
  if (imported.failed.length) throw new Error(imported.failed[0].error);
  const queueId = imported.queueItemIds[0];
  // Allow reprocess even if somehow skipped
  await prisma.importQueueItem.update({
    where: { id: queueId },
    data: { status: ImportQueueStatus.queued, productId: null, error: null },
  });
  const processed = await processImportQueueItem(queueId);
  if (!processed.ok || !processed.productId) throw new Error("process failed");

  const product = await prisma.product.findUnique({
    where: { id: processed.productId },
    include: { variants: true },
  });
  const queue = await prisma.importQueueItem.findUnique({ where: { id: queueId } });
  if (!product) throw new Error("no product");

  const images = parseImages(product.images);
  const supplierSpecs = (product.supplierSpecs || {}) as Record<string, string>;
  const attributes = (product.attributes || {}) as Record<string, string>;
  const videos = Array.isArray(product.videos) ? product.videos : [];
  const completeness = product.importCompleteness as {
    score?: number;
    parts?: Array<{ label: string; got: number; expected: number; ok: boolean }>;
  } | null;

  const checks = {
    imagesMatch: images.length === rawImages.length,
    variantsMatch: product.variants.length === source.variants.length,
    specsPresent: Object.keys(supplierSpecs).length >= Object.keys(source.specifications).length,
    attributesPresent: Object.keys(attributes).length >= Object.keys(source.attributes).length,
    videosMatch: videos.length === source.videos.length,
    stockMatch: product.stock === (source.stock ?? 0),
    skuMatch: product.sku === source.sku || product.supplierSku === source.sku,
    inactive: product.isActive === false,
    score: completeness?.score ?? 0,
  };

  console.log("\n=== VERIFICATION ===");
  console.log(
    JSON.stringify(
      {
        productId: product.id,
        queueId,
        previewPath: `/admin/suppliers/import-queue/${queueId}/preview`,
        images: `${images.length}/${rawImages.length}`,
        variants: `${product.variants.length}/${source.variants.length}`,
        specs: `${Object.keys(supplierSpecs).length}/${Object.keys(source.specifications).length}`,
        attributes: `${Object.keys(attributes).length}/${Object.keys(source.attributes).length}`,
        videos: `${videos.length}/${source.videos.length}`,
        stock: `${product.stock} (source ${source.stock})`,
        sku: product.sku,
        completeness,
        checks,
        queueError: queue?.error,
      },
      null,
      2
    )
  );

  const failed = Object.entries(checks).filter(([k, v]) => {
    if (k === "score") return (v as number) < 95;
    return v !== true;
  });

  console.log("\n3) Clean delete via bulkDeleteProducts (transaction)...");
  const del = await bulkDeleteProducts([product.id]);
  if (del.updated !== 1) throw new Error("delete failed");

  const leftover = {
    product: await prisma.product.count({ where: { id: product.id } }),
    variants: await prisma.productVariant.count({ where: { productId: product.id } }),
    queue: await prisma.importQueueItem.count({
      where: {
        OR: [{ id: queueId }, { productId: product.id }, { supplier: "cj", supplierProductId: PID }],
      },
    }),
  };
  console.log("LEFTOVER:", leftover);

  if (leftover.product || leftover.variants || leftover.queue) {
    throw new Error("Orphan data after delete");
  }

  if (failed.length) {
    console.error("FAILED_CHECKS:", failed.map(([k]) => k).join(", "));
    process.exitCode = 1;
    return;
  }

  console.log("\nALL CHECKS PASSED — 100% pipeline OK for this product.");
}

main()
  .catch((e) => {
    console.error("SANDBOX_FAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
