/**
 * Generic catalog sync engine — provider-agnostic.
 * Detects diffs, applies SyncPolicy, versions changes, never blind-overwrites retail.
 */

import "server-only";

import {
  CatalogVersionKind,
  SupplierName,
  SupplierProductStatus,
  type Prisma,
  type SyncPolicy,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SupplierProvider } from "@/lib/suppliers/provider";
import { toInternalProduct, snapshotInternalProduct } from "@/lib/suppliers/internal-product";
import { detectSupplierChanges } from "@/lib/suppliers/sync/diff";
import { decideSyncAction } from "@/lib/suppliers/sync/policy";
import { convertPriceToNOK } from "@/lib/import/pricing";
import { logError } from "@/lib/utils/logger";
import { ensureDefaultSupplierAccount } from "@/lib/suppliers/accounts";
import { persistSupplierRaw } from "@/lib/suppliers/storage/provider";
import { recordCatalogVersions } from "@/lib/suppliers/versioning";

function toSupplierName(id: string): SupplierName {
  return id as SupplierName;
}

export type SyncEngineResult = {
  checked: number;
  updated: number;
  unavailable: number;
  changeEvents: number;
  applied: number;
  queued: number;
  runId: string;
};

export async function runCatalogSync(opts: {
  provider: SupplierProvider;
  supplierProductIds?: string[];
  supplierAccountId?: string | null;
  /** @deprecated Prefer SyncPolicy on SupplierAccount */
  applySafeUpdates?: boolean;
  take?: number;
}): Promise<SyncEngineResult> {
  const { provider } = opts;
  const supplierName = toSupplierName(provider.id);

  const account = opts.supplierAccountId
    ? await prisma.supplierAccount.findUnique({
        where: { id: opts.supplierAccountId },
        include: { syncPolicy: true },
      })
    : await ensureDefaultSupplierAccount(provider.id);

  const policy: SyncPolicy | null = account?.syncPolicy || null;

  const run = await prisma.supplierSyncRun.create({
    data: {
      supplier: supplierName,
      supplierAccountId: account?.id || null,
      status: "running",
      nextScheduledAt: new Date(
        Date.now() +
          ((account?.syncSettings as { intervalHours?: number } | null)?.intervalHours || 6) *
            60 *
            60 *
            1000
      ),
    },
  });

  try {
    const products = await prisma.product.findMany({
      where: {
        ...(account?.id
          ? {
              OR: [
                { supplierAccountId: account.id },
                { supplierAccountId: null, supplierName },
              ],
            }
          : { supplierName }),
        ...(opts.supplierProductIds?.length
          ? { supplierProductId: { in: opts.supplierProductIds } }
          : { supplierProductId: { not: null } }),
      },
      select: {
        id: true,
        supplierProductId: true,
        supplierAccountId: true,
        supplierPrice: true,
        price: true,
        stock: true,
        images: true,
        supplierSpecs: true,
        attributes: true,
        videos: true,
        supplierSnapshot: true,
        supplierRawArtifactId: true,
      },
      take: opts.take ?? 500,
      orderBy: { lastInventoryCheck: "asc" },
    });

    let updated = 0;
    let unavailable = 0;
    let changeEvents = 0;
    let applied = 0;
    let queued = 0;

    for (const product of products) {
      if (!product.supplierProductId) continue;
      try {
        const detail = await provider.getProduct(product.supplierProductId);
        if (!detail) {
          unavailable += 1;
          await prisma.product.update({
            where: { id: product.id },
            data: {
              supplierStatus: SupplierProductStatus.unavailable,
              supplierLastSync: new Date(),
              lastInventoryCheck: new Date(),
              supplierAccountId: product.supplierAccountId || account?.id || null,
            },
          });
          await prisma.supplierChangeEvent.create({
            data: {
              productId: product.id,
              supplier: supplierName,
              supplierAccountId: account?.id || null,
              supplierProductId: product.supplierProductId,
              changeType: "unavailable",
              field: "availability",
              before: { available: true },
              after: { available: false },
              summary: "Produkt ikke lenger tilgjengelig hos leverandør",
              applied: true,
              policyDecision: "apply",
            },
          });
          changeEvents += 1;
          applied += 1;
          continue;
        }

        const internal = toInternalProduct(detail);
        const diffs = detectSupplierChanges(product.supplierSnapshot, internal);

        const applyStock =
          opts.applySafeUpdates !== false &&
          decideSyncAction(policy, "stock") === "apply";
        const applySupplierPrice =
          opts.applySafeUpdates !== false &&
          decideSyncAction(policy, "price") === "apply";
        const applyImagesNew =
          decideSyncAction(policy, "images_added", { isNewAsset: true }) === "apply";
        const applyVideos = decideSyncAction(policy, "videos") === "apply";
        const applySpecs = decideSyncAction(policy, "specs") === "apply";
        const applyAttributes = decideSyncAction(policy, "attributes") === "apply";

        for (const diff of diffs) {
          const action = decideSyncAction(policy, diff.changeType, {
            isNewAsset: diff.changeType === "images_added",
            supplierContentChanged: true,
          });
          if (action === "ignore") continue;

          await prisma.supplierChangeEvent.create({
            data: {
              productId: product.id,
              supplier: supplierName,
              supplierAccountId: account?.id || null,
              supplierProductId: product.supplierProductId,
              changeType: diff.changeType,
              field: diff.field,
              before: diff.before as Prisma.InputJsonValue,
              after: diff.after as Prisma.InputJsonValue,
              summary: diff.summary,
              applied: action === "apply",
              policyDecision: action,
            },
          });
          changeEvents += 1;
          if (action === "apply") applied += 1;
          else queued += 1;
        }

        const stock = internal.stock ?? 0;
        const status =
          stock > 0
            ? SupplierProductStatus.available
            : SupplierProductStatus.out_of_stock;
        const costNOK = convertPriceToNOK(internal.price, internal.currency);

        const versionEntries: Array<{
          kind: CatalogVersionKind;
          payload: unknown;
          summary?: string;
        }> = [];

        const data: Prisma.ProductUpdateInput = {
          supplierLastSync: new Date(),
          lastInventoryCheck: new Date(),
          lastSynced: new Date(),
          supplierAccount: account?.id
            ? { connect: { id: account.id } }
            : undefined,
          supplierCurrency: internal.currency,
          warehouse: internal.warehouse,
          supplierSnapshot: snapshotInternalProduct(internal) as Prisma.InputJsonValue,
        };

        if (applyStock) {
          data.stock = stock;
          data.supplierInventory = stock;
          data.supplierStatus = status;
          versionEntries.push({
            kind: CatalogVersionKind.stock,
            payload: { before: product.stock, after: stock },
            summary: `stock ${product.stock} → ${stock}`,
          });
        }

        if (applySupplierPrice) {
          data.supplierPrice = costNOK;
          versionEntries.push({
            kind: CatalogVersionKind.price,
            payload: {
              before: { supplier: product.supplierPrice, retail: product.price },
              after: { supplier: costNOK, retail: product.price },
            },
            summary: `supplierPrice → ${costNOK}`,
          });
        }

        if (applySpecs) {
          data.supplierSpecs = internal.specifications as Prisma.InputJsonValue;
          versionEntries.push({
            kind: CatalogVersionKind.specs,
            payload: internal.specifications,
          });
        }

        if (applyAttributes) {
          data.attributes = internal.attributes as Prisma.InputJsonValue;
          versionEntries.push({
            kind: CatalogVersionKind.attributes,
            payload: internal.attributes,
          });
        }

        if (applyVideos) {
          data.videos = internal.videos as Prisma.InputJsonValue;
          versionEntries.push({
            kind: CatalogVersionKind.videos,
            payload: internal.videos,
          });
        }

        if (applyImagesNew && diffs.some((d) => d.changeType === "images_added")) {
          data.images = JSON.stringify(internal.images);
          versionEntries.push({
            kind: CatalogVersionKind.images,
            payload: internal.images,
          });
        }

        // Raw via storage — do not grow Product.supplierRaw
        if (detail.raw != null) {
          const artifact = await persistSupplierRaw({
            supplier: supplierName,
            supplierAccountId: account?.id,
            supplierProductId: product.supplierProductId,
            payload: detail.raw,
            meta: { source: "sync" },
          });
          data.supplierRawArtifact = { connect: { id: artifact.artifactId } };
        }

        versionEntries.push({
          kind: CatalogVersionKind.snapshot,
          payload: snapshotInternalProduct(internal),
          summary: "sync snapshot",
        });

        await prisma.product.update({
          where: { id: product.id },
          data,
        });

        if (applyStock || applySupplierPrice) {
          for (const v of internal.variants) {
            if (!v.supplierVariantId) continue;
            await prisma.productVariant.updateMany({
              where: {
                productId: product.id,
                supplierVariantId: v.supplierVariantId,
              },
              data: {
                ...(applyStock ? { stock: v.stock ?? 0 } : {}),
                ...(applySupplierPrice
                  ? { supplierPrice: convertPriceToNOK(v.price, v.currency) }
                  : {}),
                weightGrams: v.weightGrams,
              },
            });
          }
        }

        if (versionEntries.length) {
          await recordCatalogVersions({
            productId: product.id,
            source: "sync",
            entries: versionEntries,
          });
        }

        updated += 1;
      } catch (error) {
        logError(error, `[sync-engine:${provider.id}:${product.supplierProductId}]`);
      }
    }

    await prisma.supplierSyncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        productsChecked: products.length,
        priceChanges: applied,
        outOfStock: unavailable,
        unavailable,
        changeEvents,
      },
    });

    return {
      checked: products.length,
      updated,
      unavailable,
      changeEvents,
      applied,
      queued,
      runId: run.id,
    };
  } catch (error) {
    await prisma.supplierSyncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errors: {
          message: error instanceof Error ? error.message : "sync failed",
        },
      },
    });
    throw error;
  }
}
