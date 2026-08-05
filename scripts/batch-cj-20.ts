/**
 * Batch-import ~20 diverse CJ products through Supplier Engine V2 pipeline.
 * Keeps inactive drafts. Reports completeness / gaps.
 *
 * NODE_OPTIONS='--require ./scripts/stub-server-only.cjs' npx tsx scripts/batch-cj-20.ts
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { createCjCatalogProvider } from "../lib/suppliers/cj/provider";
import { processImportQueueItem } from "../lib/suppliers/import-queue";
import { ImportQueueStatus } from "@prisma/client";

async function main() {
  const provider = createCjCatalogProvider();
  if (!(await provider.isConfigured())) throw new Error("CJ not configured");

  const queries = [
    "Gaming Mouse",
    "USB Hub",
    "LED Strip",
    "Phone Case",
    "Wireless Earbuds",
    "Keyboard",
    "Webcam",
    "Power Bank",
  ];

  const candidates: string[] = [];
  for (const q of queries) {
    const res = await provider.searchProducts({
      query: q,
      page: 1,
      pageSize: 10,
      sortBy: "bestsellers",
    });
    for (const p of res.products) {
      if (p.id && !candidates.includes(p.id)) candidates.push(p.id);
    }
  }

  const pick = candidates.slice(0, 22);
  console.log(`Selected ${pick.length} product ids`);

  // Clear previous batch tags from these ids in queue/products if re-run
  const imported = await provider.importProducts(pick, {
    createdByEmail: "batch20@local",
  });
  console.log(`Enqueue: imported=${imported.imported} skipped=${imported.skipped} failed=${imported.failed.length}`);

  const results = [];
  for (const queueId of imported.queueItemIds) {
    const item = await prisma.importQueueItem.findUnique({ where: { id: queueId } });
    if (!item) continue;
    if (item.status !== ImportQueueStatus.queued && item.productId) {
      // already processed — include report
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: { variants: true },
      });
      results.push(summarize(item, product));
      continue;
    }
    if (item.status !== ImportQueueStatus.queued) {
      await prisma.importQueueItem.update({
        where: { id: queueId },
        data: { status: ImportQueueStatus.queued, productId: null, error: null },
      });
    }
    try {
      // If product already exists from skip, delete draft first? unique constraint
      if (item.productId) {
        // noop
      }
      // Ensure no existing product for same supplier id
      const existing = await prisma.product.findFirst({
        where: {
          supplierName: "cj",
          supplierProductId: item.supplierProductId,
        },
      });
      if (existing) {
        await prisma.productVariant.deleteMany({ where: { productId: existing.id } });
        await prisma.importQueueItem.updateMany({
          where: { productId: existing.id },
          data: { productId: null },
        });
        await prisma.product.delete({ where: { id: existing.id } });
      }

      await prisma.importQueueItem.update({
        where: { id: queueId },
        data: { status: ImportQueueStatus.queued, productId: null, error: null, attempts: 0 },
      });

      const processed = await processImportQueueItem(queueId);
      const product = processed.productId
        ? await prisma.product.findUnique({
            where: { id: processed.productId },
            include: { variants: true },
          })
        : null;
      const fresh = await prisma.importQueueItem.findUnique({ where: { id: queueId } });
      results.push(summarize(fresh, product));
    } catch (e: unknown) {
      results.push({
        queueId,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const report = {
    total: results.length,
    ok: results.filter((r) => (r as { ok?: boolean }).ok !== false && (r as { score?: number }).score != null).length,
    score100: results.filter((r) => (r as { score?: number }).score === 100).length,
    withVariants: results.filter((r) => ((r as { variants?: number }).variants || 0) > 0).length,
    noVariants: results.filter((r) => (r as { variants?: number }).variants === 0).length,
    withVideos: results.filter((r) => ((r as { videos?: number }).videos || 0) > 0).length,
    noVideos: results.filter((r) => (r as { videos?: number }).videos === 0).length,
    withSpecs: results.filter((r) => ((r as { specs?: number }).specs || 0) > 0).length,
    failed: results.filter((r) => (r as { ok?: boolean }).ok === false || (r as { status?: string }).status === "failed"),
    samples: results.slice(0, 25),
  };

  console.log(JSON.stringify(report, null, 2));
}

function summarize(item: any, product: any) {
  if (!item) return { ok: false, error: "missing item" };
  const images = product?.images ? safeJsonArray(product.images).length : 0;
  const specs =
    product?.supplierSpecs && typeof product.supplierSpecs === "object"
      ? Object.keys(product.supplierSpecs).length
      : 0;
  const videos = Array.isArray(product?.videos) ? product.videos.length : 0;
  const completeness = product?.importCompleteness as { score?: number } | null;
  return {
    ok: item.status !== "failed",
    queueId: item.id,
    productId: product?.id || null,
    title: item.title,
    status: item.status,
    pipelineStage: item.pipelineStage,
    images,
    variants: product?.variants?.length ?? 0,
    specs,
    videos,
    stock: product?.stock,
    score: completeness?.score ?? null,
    error: item.error,
    rawPath: product?.id ? `/admin/products/${product.id}/supplier-raw` : null,
  };
}

function safeJsonArray(raw: string): unknown[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

main()
  .catch((e) => {
    console.error("BATCH_FAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
