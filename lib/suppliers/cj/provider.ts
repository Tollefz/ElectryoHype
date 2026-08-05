import "server-only";

import { SupplierName, SupplierProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isCjConfigured } from "@/lib/suppliers/cj/api";
import { enqueueCjProducts } from "@/lib/suppliers/cj/importer";
import { fetchCjInventorySnapshot, fetchCjProduct } from "@/lib/suppliers/cj/mapper";
import { searchCjProducts } from "@/lib/suppliers/cj/search";
import { calculateSupplierPricing } from "@/lib/suppliers/pricing";
import { facetsFromGetProduct } from "@/lib/suppliers/provider-facets";
import type {
  SupplierImportResult,
  SupplierProductDetail,
  SupplierProvider,
  SupplierSearchFilters,
  SupplierSearchResult,
} from "@/lib/suppliers/provider";
import { convertPriceToNOK } from "@/lib/import/pricing";
import { ensureDefaultSupplierAccount } from "@/lib/suppliers/accounts";

function normalizeCjRaw(raw: unknown): SupplierProductDetail {
  // CJ mapper already returns SupplierProductDetail; if raw is detail-shaped, pass through.
  if (raw && typeof raw === "object" && "id" in raw && "title" in raw && "variants" in raw) {
    return raw as SupplierProductDetail;
  }
  throw new Error("CJ normalizeProduct expects a mapped SupplierProductDetail or call getProduct()");
}

export function createCjCatalogProvider(): SupplierProvider {
  const getProduct = async (supplierProductId: string) => fetchCjProduct(supplierProductId);
  const facets = facetsFromGetProduct(getProduct, normalizeCjRaw);

  return {
    id: "cj",
    displayName: "CJdropshipping",

    async isConfigured() {
      return isCjConfigured();
    },

    async searchProducts(filters: SupplierSearchFilters): Promise<SupplierSearchResult> {
      return searchCjProducts(filters);
    },

    getProduct,
    normalizeProduct: normalizeCjRaw,
    getInventory: facets.getInventory,
    getPricing: facets.getPricing,
    getMedia: facets.getMedia,
    getSpecifications: facets.getSpecifications,
    getVideos: facets.getVideos,

    async importProducts(
      supplierProductIds: string[],
      opts?: {
        createdById?: string | null;
        createdByEmail?: string | null;
        storeId?: string | null;
        supplierAccountId?: string | null;
      }
    ): Promise<SupplierImportResult> {
      const account = await ensureDefaultSupplierAccount("cj");
      return enqueueCjProducts(supplierProductIds, {
        ...opts,
        supplierAccountId: opts?.supplierAccountId || account.id,
      });
    },

    async syncInventory(supplierProductIds?: string[]) {
      const products = await prisma.product.findMany({
        where: {
          supplierName: SupplierName.cj,
          ...(supplierProductIds?.length
            ? { supplierProductId: { in: supplierProductIds } }
            : { supplierProductId: { not: null } }),
        },
        select: { id: true, supplierProductId: true, stock: true },
        take: 200,
      });

      let updated = 0;
      let unavailable = 0;
      const snapshots = [];

      for (const product of products) {
        if (!product.supplierProductId) continue;
        const snap = await fetchCjInventorySnapshot(product.supplierProductId);
        if (!snap) continue;
        snapshots.push(snap);

        const status = !snap.available
          ? snap.stock === 0
            ? SupplierProductStatus.out_of_stock
            : SupplierProductStatus.unavailable
          : SupplierProductStatus.available;

        if (status === SupplierProductStatus.unavailable) unavailable += 1;

        await prisma.product.update({
          where: { id: product.id },
          data: {
            stock: snap.stock ?? 0,
            supplierInventory: snap.stock,
            supplierStatus: status,
            warehouse: snap.warehouse,
            lastInventoryCheck: snap.checkedAt,
            supplierLastSync: snap.checkedAt,
            lastSynced: snap.checkedAt,
          },
        });
        updated += 1;
      }

      return { checked: products.length, updated, unavailable, snapshots };
    },

    async syncPrice(supplierProductIds?: string[]) {
      const products = await prisma.product.findMany({
        where: {
          supplierName: SupplierName.cj,
          ...(supplierProductIds?.length
            ? { supplierProductId: { in: supplierProductIds } }
            : { supplierProductId: { not: null } }),
        },
        select: {
          id: true,
          supplierProductId: true,
          supplierPrice: true,
          category: true,
        },
        take: 200,
      });

      let updated = 0;
      for (const product of products) {
        if (!product.supplierProductId) continue;
        const detail = await fetchCjProduct(product.supplierProductId);
        if (!detail) {
          await prisma.product.update({
            where: { id: product.id },
            data: {
              supplierStatus: SupplierProductStatus.unavailable,
              supplierLastSync: new Date(),
            },
          });
          continue;
        }

        const costNOK = convertPriceToNOK(detail.price, detail.currency);
        const pricing = calculateSupplierPricing({
          supplierPrice: detail.price,
          currency: detail.currency,
          weightGrams: detail.weightGrams,
          category: product.category,
        });

        await prisma.product.update({
          where: { id: product.id },
          data: {
            supplierPrice: costNOK,
            supplierCurrency: detail.currency,
            supplierShipping: pricing.shippingNOK,
            supplierInventory: detail.stock,
            supplierLastSync: new Date(),
            lastSynced: new Date(),
            supplierStatus: SupplierProductStatus.available,
          },
        });
        updated += 1;
      }

      return { checked: products.length, updated };
    },
  };
}
