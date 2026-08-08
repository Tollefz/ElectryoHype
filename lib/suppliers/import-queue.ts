/**
 * Import pipeline orchestrator V2:
 * Validate → Normalize → Enrich → Quality → Persist draft (preview/review)
 */

import "server-only";

import {
  CatalogVersionKind,
  ImportQueueStatus,
  SupplierProductStatus,
  type Prisma,
} from "@prisma/client";
import slugify from "slugify";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { logError } from "@/lib/utils/logger";
import {
  toInternalProduct,
  snapshotInternalProduct,
  type InternalProduct,
} from "@/lib/suppliers/internal-product";
import { validateInternalProduct } from "@/lib/suppliers/pipeline/validate";
import { normalizeInternalProduct } from "@/lib/suppliers/pipeline/normalize";
import { enrichInternalProduct } from "@/lib/suppliers/pipeline/enrich";
import { qualityCheckInternalProduct } from "@/lib/suppliers/pipeline/quality";
import type { SupplierProductDetail } from "@/lib/suppliers/provider";
import { logImagePrepareReport } from "@/lib/import/image-quality";
import { ensureDefaultSupplierAccount } from "@/lib/suppliers/accounts";
import { persistSupplierRaw, loadSupplierRawPayload } from "@/lib/suppliers/storage/provider";
import { decideImportReview, reviewStatusFromDecision } from "@/lib/suppliers/review";
import {
  recordCatalogVersions,
  snapshotFieldsForVersioning,
} from "@/lib/suppliers/versioning";
import { categorizeForSave } from "@/lib/categories/apply-on-save";
import { formatImportErrorForStorage } from "@/lib/ops/import-failure-reasons";

async function uniqueSlug(base: string): Promise<string> {
  const root =
    slugify(base, { lower: true, strict: true, trim: true }).slice(0, 80) ||
    `produkt-${Date.now()}`;
  let candidate = root;
  let i = 2;
  while (await prisma.product.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${root}-${i}`;
    i += 1;
  }
  return candidate;
}

async function setStage(itemId: string, status: ImportQueueStatus, stage: string, extra?: object) {
  await prisma.importQueueItem.update({
    where: { id: itemId },
    data: {
      status,
      pipelineStage: stage,
      ...(extra || {}),
    },
  });
}

/**
 * Process one import queue item through the full V2 pipeline.
 */
export async function processImportQueueItem(itemId: string) {
  const item = await prisma.importQueueItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Import-kø element ikke funnet");

  await prisma.importQueueItem.update({
    where: { id: itemId },
    data: {
      status: ImportQueueStatus.processing,
      pipelineStage: "processing",
      attempts: { increment: 1 },
      error: null,
    },
  });

  try {
    const draft = (item.mappedDraft || {}) as Record<string, unknown>;
    let raw = item.rawPayload;
    if (item.rawArtifactId) {
      const loaded = await loadSupplierRawPayload(item.rawArtifactId);
      if (loaded != null) raw = loaded as typeof raw;
    }

    const account =
      item.supplierAccountId
        ? await prisma.supplierAccount.findUnique({ where: { id: item.supplierAccountId } })
        : await ensureDefaultSupplierAccount(item.supplier);
    const supplierAccountId = account?.id || item.supplierAccountId || null;

    // Idempotency (early): never create a second catalog row for the same supplier SKU.
    const existingProductEarly = await prisma.product.findFirst({
      where: {
        supplierName: item.supplier,
        supplierProductId: item.supplierProductId,
      },
      select: { id: true, isActive: true, slug: true, name: true },
    });
    if (existingProductEarly) {
      console.log(
        `[import] Already published ${JSON.stringify({
          reason: existingProductEarly.isActive
            ? "existing catalog product (active)"
            : "existing catalog product (draft)",
          productId: existingProductEarly.id,
          handle: existingProductEarly.slug,
          isActive: existingProductEarly.isActive,
        })}`
      );
      if (existingProductEarly.isActive) {
        await prisma.importQueueItem.update({
          where: { id: itemId },
          data: {
            productId: existingProductEarly.id,
            status: ImportQueueStatus.published,
            pipelineStage: "published",
            publishedAt: new Date(),
            processedAt: new Date(),
            error: null,
            reviewReason: "Already published — existing catalog product",
            supplierAccountId,
          },
        });
        return {
          ok: true as const,
          productId: existingProductEarly.id,
          status: ImportQueueStatus.published,
          autoApproved: true,
          alreadyPublished: true,
        };
      }
      await prisma.importQueueItem.update({
        where: { id: itemId },
        data: {
          productId: existingProductEarly.id,
          status: ImportQueueStatus.approved,
          pipelineStage: "approved",
          processedAt: new Date(),
          autoApproved: true,
          error: null,
          reviewReason: null,
          supplierAccountId,
        },
      });
      return {
        ok: true as const,
        productId: existingProductEarly.id,
        status: ImportQueueStatus.approved,
        autoApproved: true,
        alreadyPublished: false,
      };
    }

    // Rebuild InternalProduct from mappedDraft (provider-agnostic)
    const detailLike: SupplierProductDetail = {
      id: item.supplierProductId,
      sku: (draft.sku as string) || item.supplierSku || null,
      title: (draft.title as string) || item.title || "Produkt",
      description: (draft.description as string) || "",
      images: (draft.sourceImages as string[]) || (draft.images as string[]) || [],
      sourceImages: (draft.sourceImages as string[]) || (draft.images as string[]) || [],
      price: item.supplierPrice ?? 0,
      currency: item.supplierCurrency || "USD",
      category: (draft.category as string) || null,
      categoryId: (draft.categoryId as string) || null,
      stock: typeof draft.stock === "number" ? draft.stock : null,
      deliveryTime: (draft.deliveryTime as string) || null,
      weightGrams: typeof draft.weightGrams === "number" ? draft.weightGrams : null,
      weightRaw: (draft.weightRaw as string) || null,
      packingWeightRaw: (draft.packingWeightRaw as string) || null,
      warehouse: (draft.warehouse as string) || null,
      variants: Array.isArray(draft.variants) ? (draft.variants as SupplierProductDetail["variants"]) : [],
      specifications: (draft.specifications as Record<string, string>) || {},
      attributes: (draft.attributes as Record<string, string>) || {},
      videos: Array.isArray(draft.videos) ? (draft.videos as SupplierProductDetail["videos"]) : [],
      supplierUrl: (draft.supplierUrl as string) || null,
      shippingEstimate: null,
      listedCount: typeof draft.listedCount === "number" ? draft.listedCount : null,
      suggestSellPriceRaw: (draft.suggestSellPriceRaw as string) || null,
      status: (draft.status as string) || null,
      raw,
    };

    const source = toInternalProduct(detailLike);

    // 1) Validate
    await setStage(itemId, ImportQueueStatus.validating, "validate");
    const validation = validateInternalProduct(source);
    await prisma.importQueueItem.update({
      where: { id: itemId },
      data: { validationReport: validation as object },
    });
    if (!validation.ok) {
      throw new Error(
        validation.issues
          .filter((i) => i.severity === "error")
          .map((i) => i.message)
          .join("; ")
      );
    }

    // 2) Normalize
    await setStage(itemId, ImportQueueStatus.normalizing, "normalize");
    const { product: normalized, imageReport } = normalizeInternalProduct(source);
    logImagePrepareReport(imageReport.report, (msg, meta) => console.info(msg, meta));

    // 3) Enrich
    await setStage(itemId, ImportQueueStatus.enriching, "enrich");
    const enrich = await enrichInternalProduct(normalized, {
      categoryHint: normalized.category,
    });

    // 4) Persist draft product
    const slug = await uniqueSlug(
      enrich.enrichment.slug || enrich.enrichment.title || normalized.title
    );
    const stockTotal = normalized.stock ?? 0;

    // Persist raw via StorageProvider (metadata in DB; no unbounded Product.supplierRaw growth)
    let rawArtifactId = item.rawArtifactId;
    if (raw != null && !rawArtifactId) {
      const stored = await persistSupplierRaw({
        supplier: item.supplier,
        supplierAccountId,
        supplierProductId: item.supplierProductId,
        payload: raw,
        meta: { stage: "import-pipeline" },
      });
      rawArtifactId = stored.artifactId;
    }

    // Category Engine — supplier category is hint only
    const categoryPersist = await categorizeForSave({
      title: enrich.enrichment.title || normalized.title,
      description: enrich.description,
      shortDescription: enrich.shortDescription,
      specs: Object.fromEntries(
        Object.entries(
          (enrich.mergedSpecs && typeof enrich.mergedSpecs === "object"
            ? enrich.mergedSpecs
            : {}) as Record<string, unknown>
        ).map(([k, v]) => [k, String(v ?? "")])
      ),
      images: normalized.images,
      variants: normalized.variants.map((v) => v.name),
      tags: enrich.enrichment.tags || [],
      supplierCategory: normalized.category,
      existingSpecs: enrich.mergedSpecs,
    });

    const product = await prisma.$transaction(
      async (tx) => {
        // Use UncheckedCreateInput so FK scalars (supplierAccountId) are accepted.
        const createData: Prisma.ProductUncheckedCreateInput = {
          name: enrich.enrichment.title || normalized.title,
          slug,
          storeId: item.storeId || DEFAULT_STORE_ID,
          description: enrich.description,
          shortDescription: enrich.shortDescription,
          price: enrich.pricing.recommendedSalePrice,
          compareAtPrice: enrich.pricing.compareAtPrice,
          supplierPrice: enrich.pricing.costNOK,
          images: JSON.stringify(normalized.images),
          supplierUrl: normalized.supplierUrl,
          supplierName: item.supplier,
          supplierAccountId: supplierAccountId || undefined,
          supplierProductId: item.supplierProductId,
          supplierSku: item.supplierSku || normalized.sku,
          warehouse: normalized.warehouse,
          supplierStatus:
            stockTotal > 0
              ? SupplierProductStatus.available
              : SupplierProductStatus.out_of_stock,
          supplierCurrency: normalized.currency,
          supplierShipping: enrich.pricing.shippingNOK,
          supplierInventory: stockTotal,
          supplierRawArtifactId: rawArtifactId || undefined,
          supplierSnapshot: snapshotInternalProduct(
            normalized
          ) as Prisma.InputJsonValue,
          supplierLastSync: new Date(),
          lastInventoryCheck: new Date(),
          lastSynced: new Date(),
          category: categoryPersist.category,
          subcategory: categoryPersist.subcategory,
          tags: categoryPersist.tags,
          sku: item.supplierSku || normalized.sku,
          stock: Math.max(0, stockTotal),
          isActive: false,
          specs: categoryPersist.specsPatch as Prisma.InputJsonValue,
          supplierSpecs: normalized.specifications as Prisma.InputJsonValue,
          attributes: normalized.attributes as Prisma.InputJsonValue,
          videos: normalized.videos as unknown as Prisma.InputJsonValue,
          metaTitle: enrich.enrichment.metaTitle,
          metaDescription: enrich.enrichment.metaDescription,
          aiCategorySuggested: categoryPersist.aiCategorySuggested,
          aiCategoryConfidence: categoryPersist.aiCategoryConfidence,
          aiCategoryReason: categoryPersist.aiCategoryReason,
          aiCategoryStatus: categoryPersist.aiCategoryStatus,
          aiCategoryAt: categoryPersist.aiCategoryAt,
          autoImport: true,
        };

        const created = await tx.product.create({
          data: createData,
        });

        if (normalized.variants.length > 0) {
          await tx.productVariant.createMany({
            data: normalized.variants.map((v) => ({
              productId: created.id,
              name: v.name,
              sku: v.sku,
              supplierVariantId: v.supplierVariantId,
              price: enrich.pricing.recommendedSalePrice,
              compareAtPrice: enrich.pricing.compareAtPrice,
              supplierPrice: v.price
                ? enrich.pricing.costNOK * (v.price / Math.max(normalized.price, 0.01))
                : enrich.pricing.costNOK,
              image: v.imageUrl || normalized.images[0] || null,
              attributes: v.attributes as Prisma.InputJsonValue,
              stock: v.stock ?? 0,
              weightGrams: v.weightGrams,
              barcode: v.barcode,
              isActive: true,
            })),
            skipDuplicates: true,
          });
        }

        const savedVariants = await tx.productVariant.count({
          where: { productId: created.id },
        });

        const quality = qualityCheckInternalProduct({
          source,
          normalized,
          enrich,
          savedVariantCount: savedVariants,
        });

        await tx.product.update({
          where: { id: created.id },
          data: {
            importCompleteness: quality.completeness as unknown as Prisma.InputJsonValue,
          },
        });

        const dropped =
          (imageReport.dropped as Array<{ reason?: string }> | undefined)?.length || 0;
        const decision = decideImportReview({
          completeness: quality.completeness,
          validationIssues: validation.issues,
          imageDropped: dropped,
          enrichmentWarning: enrich.warning || null,
          conflicts: [],
        });
        const nextStatus = reviewStatusFromDecision(decision);

        await tx.importQueueItem.update({
          where: { id: itemId },
          data: {
            status: nextStatus,
            pipelineStage: decision.autoApprove ? "approved" : "review",
            supplierAccountId,
            rawArtifactId,
            enrichment: {
              ...enrich.enrichment,
              aiGenerated: enrich.aiGenerated,
              warning: enrich.warning || null,
              supplierSpecsPreserved: true,
            } as object,
            pricing: enrich.pricing,
            completeness: quality.completeness as object,
            imageReport: {
              report: imageReport.report,
              dropped: imageReport.dropped,
            } as object,
            productId: created.id,
            processedAt: new Date(),
            autoApproved: decision.autoApprove,
            reviewReason: decision.reason,
            error: decision.autoApprove
              ? null
              : decision.reason,
          },
        });

        return { created, quality, decision, nextStatus };
      },
      { timeout: 120_000, maxWait: 20_000 }
    );

    // Initial catalog versions (outside txn for clarity)
    await recordCatalogVersions({
      productId: product.created.id,
      source: "import",
      entries: [
        ...snapshotFieldsForVersioning({
          price: product.created.price,
          supplierPrice: product.created.supplierPrice,
          stock: product.created.stock,
          images: product.created.images,
          supplierSpecs: normalized.specifications,
          attributes: normalized.attributes,
          videos: normalized.videos,
          supplierSnapshot: snapshotInternalProduct(normalized),
        }),
        {
          kind: CatalogVersionKind.full,
          payload: {
            completeness: product.quality.completeness,
            review: product.decision,
          },
          summary: "Initial import snapshot",
        },
      ],
    });

    return {
      ok: true as const,
      productId: product.created.id,
      status: product.nextStatus,
      autoApproved: product.decision.autoApprove,
    };
  } catch (error: unknown) {
    logError(error, `[import-pipeline:${itemId}]`);
    const message = formatImportErrorForStorage(error, {
      title: item.title,
      supplierProductId: item.supplierProductId,
    });
    await prisma.importQueueItem.update({
      where: { id: itemId },
      data: {
        status: ImportQueueStatus.failed,
        pipelineStage: "failed",
        error: message,
      },
    });
    throw error;
  }
}

export async function processQueuedImports(limit = 10) {
  // Prefer durable worker jobs (parallel, lock, retry, DLQ)
  const { runSupplierWorkers, enqueueImportJobs } = await import(
    "@/lib/suppliers/workers/jobs"
  );

  const items = await prisma.importQueueItem.findMany({
    where: { status: ImportQueueStatus.queued },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, supplierAccountId: true, jobId: true },
  });

  const missingJobs = items.filter((i) => !i.jobId).map((i) => i.id);
  if (missingJobs.length) {
    await enqueueImportJobs(missingJobs, items[0]?.supplierAccountId);
  }

  return runSupplierWorkers({
    concurrency: Math.min(4, Math.max(1, limit)),
    limit,
    types: ["import_item"],
  });
}

export async function publishImportQueueItem(itemId: string) {
  const item = await prisma.importQueueItem.findUnique({ where: { id: itemId } });
  if (!item?.productId) throw new Error("Ingen produktdraft å publisere");
  if (item.status !== ImportQueueStatus.review && item.status !== ImportQueueStatus.approved) {
    throw new Error("Kun review/approved kan publiseres");
  }

  const completeness = item.completeness as { score?: number; requiresReview?: boolean } | null;
  if (completeness?.requiresReview && item.status !== ImportQueueStatus.approved) {
    throw new Error(
      `Completeness ${completeness.score ?? "?"}% — godkjenn eksplisitt før publisering`
    );
  }

  await prisma.$transaction([
    prisma.product.update({
      where: { id: item.productId },
      data: { isActive: true },
    }),
    prisma.importQueueItem.update({
      where: { id: itemId },
      data: {
        status: ImportQueueStatus.published,
        pipelineStage: "published",
        publishedAt: new Date(),
      },
    }),
  ]);

  try {
    const { recordAiFeedback } = await import("@/lib/trust/feedback");
    await recordAiFeedback({
      storeId: item.storeId,
      engine: "supplier",
      kind: "publish",
      subjectType: "import_queue_item",
      subjectKey: itemId,
      humanResult: { productId: item.productId, status: "published" },
      metadata: { title: item.title },
    });
  } catch {
    /* trust layer optional */
  }

  // Store DNA + Feedback learn from catalog/performance (additive)
  void import("@/lib/buyer/store-dna")
    .then((m) => m.rebuildStoreDna({ storeId: item.storeId }))
    .catch(() => undefined);
  void import("@/lib/buyer/ai-feedback")
    .then((m) => m.rebuildAiFeedback({ storeId: item.storeId }))
    .catch(() => undefined);

  return { productId: item.productId };
}

export async function approveImportQueueItem(itemId: string) {
  const item = await prisma.importQueueItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Ikke funnet");
  if (item.status !== ImportQueueStatus.review) {
    throw new Error("Kun review kan godkjennes");
  }
  return prisma.importQueueItem.update({
    where: { id: itemId },
    data: { status: ImportQueueStatus.approved, pipelineStage: "approved", error: null },
  });
}
