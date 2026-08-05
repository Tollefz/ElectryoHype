import "server-only";

import { fetchCjProduct, reportUnmappedCjFields } from "@/lib/suppliers/cj/mapper";
import { enqueueMappedProducts } from "@/lib/suppliers/enqueue";
import type { SupplierImportResult } from "@/lib/suppliers/provider";
import { logError } from "@/lib/utils/logger";

export async function enqueueCjProducts(
  supplierProductIds: string[],
  opts?: {
    createdById?: string | null;
    createdByEmail?: string | null;
    storeId?: string | null;
    supplierAccountId?: string | null;
  }
): Promise<SupplierImportResult> {
  const unique = Array.from(new Set(supplierProductIds.filter(Boolean)));
  const details = [];
  const failed: Array<{ supplierProductId: string; error: string }> = [];

  for (const pid of unique) {
    try {
      const detail = await fetchCjProduct(pid);
      if (!detail) {
        failed.push({ supplierProductId: pid, error: "Produkt ikke funnet hos CJ" });
        continue;
      }
      details.push(detail);
    } catch (error: unknown) {
      logError(error, `[cj:fetch:${pid}]`);
      failed.push({
        supplierProductId: pid,
        error: error instanceof Error ? error.message : "Henting feilet",
      });
    }
  }

  const result = await enqueueMappedProducts("cj", details, {
    createdById: opts?.createdById,
    createdByEmail: opts?.createdByEmail,
    storeId: opts?.storeId,
    supplierAccountId: opts?.supplierAccountId,
    extraDraftFor: (detail) => {
      const unmapped =
        detail.raw && typeof detail.raw === "object"
          ? reportUnmappedCjFields(detail.raw as Record<string, unknown>)
          : [];
      return { unmappedCjFields: unmapped };
    },
  });

  return {
    ...result,
    failed: [...result.failed, ...failed],
  };
}
