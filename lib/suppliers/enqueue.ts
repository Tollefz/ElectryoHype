/**
 * Generic catalog enqueue — provider-agnostic.
 * Supplier plugins fetch + map to SupplierProductDetail, then call this.
 */

import "server-only";

import { ImportQueueStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CatalogSupplierId, SupplierImportResult, SupplierProductDetail } from "@/lib/suppliers/provider";
import { calculateSupplierPricing } from "@/lib/suppliers/pricing";
import { ensureDefaultSupplierAccount, catalogIdToSupplierName } from "@/lib/suppliers/accounts";
import { persistSupplierRaw } from "@/lib/suppliers/storage/provider";
import { enqueueImportJobs } from "@/lib/suppliers/workers/jobs";
import { logError } from "@/lib/utils/logger";

export type EnqueueMappedOpts = {
  supplier: CatalogSupplierId;
  detail: SupplierProductDetail;
  createdById?: string | null;
  createdByEmail?: string | null;
  storeId?: string | null;
  supplierAccountId?: string | null;
  /** Extra fields merged into mappedDraft (e.g. unmappedCjFields) */
  extraDraft?: Record<string, unknown>;
  /** When true, also enqueue a worker job (default true). */
  enqueueJob?: boolean;
};

/**
 * Upsert one product into ImportQueue from a normalized SupplierProductDetail.
 */
export async function enqueueMappedProduct(
  opts: EnqueueMappedOpts
): Promise<{ queueItemId: string; imported: boolean; skipped: boolean; jobId?: string }> {
  const supplier = catalogIdToSupplierName(opts.supplier);
  const detail = opts.detail;
  const pid = detail.id;

  const account =
    opts.supplierAccountId
      ? await prisma.supplierAccount.findUnique({ where: { id: opts.supplierAccountId } })
      : await ensureDefaultSupplierAccount(opts.supplier);

  const accountId = account?.id || opts.supplierAccountId || null;

  const existing = await prisma.importQueueItem.findUnique({
    where: {
      supplier_supplierProductId: {
        supplier,
        supplierProductId: pid,
      },
    },
  });

  if (existing && existing.status !== ImportQueueStatus.failed) {
    return { queueItemId: existing.id, imported: false, skipped: true };
  }

  const pricing = calculateSupplierPricing({
    supplierPrice: detail.price,
    currency: detail.currency || "USD",
    shipping: detail.shippingEstimate,
    weightGrams: detail.weightGrams,
    category: detail.category,
  });

  const mappedDraft = {
    title: detail.title,
    description: detail.description,
    images: detail.sourceImages?.length ? detail.sourceImages : detail.images,
    sourceImages: detail.sourceImages?.length ? detail.sourceImages : detail.images,
    sku: detail.sku,
    variants: detail.variants,
    category: detail.category,
    categoryId: detail.categoryId,
    deliveryTime: detail.deliveryTime,
    weightGrams: detail.weightGrams,
    weightRaw: detail.weightRaw,
    packingWeightRaw: detail.packingWeightRaw,
    warehouse: detail.warehouse,
    supplierUrl: detail.supplierUrl,
    specifications: detail.specifications,
    attributes: detail.attributes,
    videos: detail.videos,
    stock: detail.stock,
    listedCount: detail.listedCount,
    suggestSellPriceRaw: detail.suggestSellPriceRaw,
    status: detail.status,
    ...(opts.extraDraft || {}),
  };

  const images = mappedDraft.sourceImages as string[];

  let rawArtifactId: string | null = null;
  if (detail.raw != null) {
    const artifact = await persistSupplierRaw({
      supplier,
      supplierAccountId: accountId,
      supplierProductId: pid,
      payload: detail.raw,
      meta: { title: detail.title, source: "enqueue" },
    });
    rawArtifactId = artifact.artifactId;
  }

  const row = await prisma.importQueueItem.upsert({
    where: {
      supplier_supplierProductId: {
        supplier,
        supplierProductId: pid,
      },
    },
    create: {
      supplier,
      supplierAccountId: accountId,
      supplierProductId: pid,
      supplierSku: detail.sku,
      title: detail.title,
      imageUrl: images[0] || null,
      supplierPrice: detail.price,
      supplierCurrency: detail.currency || "USD",
      status: ImportQueueStatus.queued,
      // Keep small pointer only — full raw in artifact
      rawPayload: rawArtifactId
        ? ({ artifactId: rawArtifactId } as object)
        : (detail.raw as object | undefined),
      rawArtifactId,
      mappedDraft,
      pricing,
      storeId: opts.storeId ?? null,
      createdById: opts.createdById ?? null,
      createdByEmail: opts.createdByEmail ?? null,
    },
    update: {
      supplierAccountId: accountId,
      supplierSku: detail.sku,
      title: detail.title,
      imageUrl: images[0] || null,
      supplierPrice: detail.price,
      supplierCurrency: detail.currency || "USD",
      status: ImportQueueStatus.queued,
      rawPayload: rawArtifactId
        ? ({ artifactId: rawArtifactId } as object)
        : (detail.raw as object | undefined),
      rawArtifactId,
      mappedDraft,
      pricing,
      completeness: undefined,
      imageReport: undefined,
      enrichment: undefined,
      productId: null,
      error: null,
      attempts: 0,
      autoApproved: false,
      reviewReason: null,
    },
  });

  let jobId: string | undefined;
  if (opts.enqueueJob !== false) {
    const jobs = await enqueueImportJobs([row.id], accountId);
    jobId = jobs[0];
  }

  return { queueItemId: row.id, imported: true, skipped: false, jobId };
}

export async function enqueueMappedProducts(
  supplier: CatalogSupplierId,
  details: SupplierProductDetail[],
  opts?: {
    createdById?: string | null;
    createdByEmail?: string | null;
    storeId?: string | null;
    supplierAccountId?: string | null;
    enqueueJob?: boolean;
    extraDraftFor?: (detail: SupplierProductDetail) => Record<string, unknown> | undefined;
  }
): Promise<SupplierImportResult> {
  const queueItemIds: string[] = [];
  const failed: Array<{ supplierProductId: string; error: string }> = [];
  let imported = 0;
  let skipped = 0;

  for (const detail of details) {
    try {
      if (!detail.id) {
        failed.push({ supplierProductId: "", error: "Mangler leverandør-produkt-ID" });
        continue;
      }
      const result = await enqueueMappedProduct({
        supplier,
        detail,
        createdById: opts?.createdById,
        createdByEmail: opts?.createdByEmail,
        storeId: opts?.storeId,
        supplierAccountId: opts?.supplierAccountId,
        enqueueJob: opts?.enqueueJob,
        extraDraft: opts?.extraDraftFor?.(detail),
      });
      queueItemIds.push(result.queueItemId);
      if (result.skipped) skipped += 1;
      else imported += 1;
    } catch (error: unknown) {
      logError(error, `[catalog:enqueue:${supplier}:${detail.id}]`);
      failed.push({
        supplierProductId: detail.id,
        error: error instanceof Error ? error.message : "Import feilet",
      });
    }
  }

  return { queueItemIds, imported, skipped, failed };
}
