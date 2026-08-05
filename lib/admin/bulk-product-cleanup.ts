import { prisma } from "@/lib/prisma";
import { parseTags } from "@/lib/admin/suggest-category";

function withArchivedTag(tagsRaw: string | null | undefined, archived: boolean): string {
  const tags = parseTags(tagsRaw).filter((t) => t.toLowerCase() !== "archived");
  if (archived) tags.push("archived");
  return JSON.stringify(tags);
}

export type BulkProductResult = {
  updated: number;
  skipped: number;
  results: { id: string; ok: boolean; error?: string }[];
};

/**
 * Hard-delete products in one transaction.
 * Skips products with order history (never orphan OrderItem FKs).
 * Removes variants, import-queue rows, and Setting rows keyed by product id.
 */
export async function bulkDeleteProducts(ids: string[]): Promise<BulkProductResult> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { updated: 0, skipped: 0, results: [] };
  }

  return prisma.$transaction(async (tx) => {
    const withOrders = await tx.orderItem.findMany({
      where: { productId: { in: uniqueIds } },
      select: { productId: true },
      distinct: ["productId"],
    });
    const blocked = new Set(withOrders.map((row) => row.productId));
    const deletable = uniqueIds.filter((id) => !blocked.has(id));

    if (deletable.length > 0) {
      await tx.productVariant.deleteMany({
        where: { productId: { in: deletable } },
      });

      // Import queue rows linked to these products (no orphan queue drafts)
      await tx.importQueueItem.deleteMany({
        where: {
          OR: [
            { productId: { in: deletable } },
            // Also clear queue rows that reference supplier ids of these products
          ],
        },
      });

      const products = await tx.product.findMany({
        where: { id: { in: deletable } },
        select: { id: true, supplierName: true, supplierProductId: true },
      });

      for (const p of products) {
        if (p.supplierName && p.supplierProductId) {
          await tx.importQueueItem.deleteMany({
            where: {
              supplier: p.supplierName,
              supplierProductId: p.supplierProductId,
            },
          });
        }
      }

      await tx.setting.deleteMany({
        where: {
          OR: deletable.flatMap((id) => [
            { key: `product:${id}` },
            { key: `product_import:${id}` },
            { key: `import_meta:${id}` },
            { key: { startsWith: `product:${id}:` } },
            { key: { startsWith: `import:${id}:` } },
          ]),
        },
      });

      await tx.product.deleteMany({
        where: { id: { in: deletable } },
      });
    }

    const results = uniqueIds.map((id) =>
      blocked.has(id)
        ? {
            id,
            ok: false as const,
            error: "Har ordrer – deaktiver/arkiver i stedet",
          }
        : { id, ok: true as const }
    );

    return {
      updated: deletable.length,
      skipped: blocked.size,
      results,
    };
  });
}

export async function bulkSetProductActive(
  ids: string[],
  isActive: boolean,
  archive: boolean
): Promise<BulkProductResult> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { updated: 0, skipped: 0, results: [] };
  }

  return prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, tags: true },
    });

    await Promise.all(
      products.map((p) =>
        tx.product.update({
          where: { id: p.id },
          data: {
            isActive,
            tags: withArchivedTag(p.tags, archive),
          },
        })
      )
    );

    const found = new Set(products.map((p) => p.id));
    const results = uniqueIds.map((id) =>
      found.has(id)
        ? { id, ok: true as const }
        : { id, ok: false as const, error: "Ikke funnet" }
    );

    return {
      updated: products.length,
      skipped: uniqueIds.length - products.length,
      results,
    };
  }).then(async (result) => {
    if (result.updated > 0) {
      void import("@/lib/buyer/store-dna")
        .then((m) => m.rebuildStoreDna())
        .catch(() => undefined);
    }
    return result;
  });
}
