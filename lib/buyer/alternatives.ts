/**
 * Alternative suppliers for products already in the catalog.
 */

import "server-only";

import type { SupplierName } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getCatalogProvider,
  listActiveCatalogSupplierIds,
} from "@/lib/suppliers/registry";
import type { CatalogSupplierId } from "@/lib/suppliers/provider";
import { productFingerprint } from "@/lib/buyer/fingerprint";
import { logError } from "@/lib/utils/logger";

function toSupplierName(id: CatalogSupplierId): SupplierName {
  return id as SupplierName;
}

export async function findAlternativeSuppliers(opts?: {
  storeId?: string | null;
  limitProducts?: number;
}) {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(opts?.storeId ? { storeId: opts.storeId } : {}),
      supplierProductId: { not: null },
      name: { not: "" },
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(40, opts?.limitProducts || 15),
    select: {
      id: true,
      name: true,
      storeId: true,
      supplierName: true,
      supplierProductId: true,
      supplierPrice: true,
      price: true,
    },
  });

  const suppliers = listActiveCatalogSupplierIds();
  let created = 0;

  for (const product of products) {
    const query = product.name.split(/\s+/).slice(0, 4).join(" ");
    const fp = productFingerprint(product.name);

    for (const supplierId of suppliers) {
      if (product.supplierName && product.supplierName === supplierId) continue;
      try {
        const provider = getCatalogProvider(supplierId);
        if (!(await provider.isConfigured())) continue;
        const result = await provider.searchProducts({
          query,
          page: 1,
          pageSize: 5,
          sortBy: "relevance",
        });

        for (const hit of result.products) {
          const hitFp = productFingerprint(hit.title);
          const similar =
            hitFp === fp ||
            hit.title.toLowerCase().includes(query.toLowerCase().slice(0, 12));
          if (!similar) continue;

          const current = product.supplierPrice ?? product.price;
          const alt = hit.price;
          if (!(alt > 0 && current > 0)) continue;
          const priceDeltaPct = ((current - alt) / current) * 100;
          if (priceDeltaPct < 3) continue; // only interesting if cheaper or similar+better

          const why = [
            `Vi selger allerede «${product.name.slice(0, 60)}».`,
            `Fant kandidat hos ${supplierId}.`,
            priceDeltaPct > 0
              ? `Lavere innpris (~${Math.round(priceDeltaPct)}% billigere).`
              : `Lignende pris (${Math.round(Math.abs(priceDeltaPct))}% differanse).`,
          ];
          if (hit.stock != null && hit.stock > 20) why.push("Bedre lagerindikasjon.");
          if (hit.imageUrl) why.push("Har produktbilde.");

          await prisma.buyerAltOffer.upsert({
            where: {
              productId_supplier_supplierProductId: {
                productId: product.id,
                supplier: toSupplierName(supplierId),
                supplierProductId: hit.id,
              },
            },
            create: {
              storeId: product.storeId,
              productId: product.id,
              supplier: toSupplierName(supplierId),
              supplierProductId: hit.id,
              title: hit.title,
              currentPrice: current,
              altPrice: alt,
              priceDeltaPct: Math.round(priceDeltaPct * 10) / 10,
              stockHint: hit.stock != null ? String(hit.stock) : null,
              shippingHint: null,
              imageScore: hit.imageUrl ? 70 : 30,
              qualityScore: 60,
              why,
              confidence: Math.min(95, 55 + Math.max(0, priceDeltaPct)),
              status: "open",
            },
            update: {
              title: hit.title,
              currentPrice: current,
              altPrice: alt,
              priceDeltaPct: Math.round(priceDeltaPct * 10) / 10,
              stockHint: hit.stock != null ? String(hit.stock) : null,
              why,
              confidence: Math.min(95, 55 + Math.max(0, priceDeltaPct)),
              status: "open",
              updatedAt: new Date(),
            },
          });
          created += 1;

          await prisma.product.update({
            where: { id: product.id },
            data: { buyerLifecycle: "replace_candidate" },
          });
        }
      } catch (error) {
        logError(error, `[buyer/alt:${supplierId}]`);
      }
    }
  }

  return { productsChecked: products.length, offersUpserted: created };
}

export async function listOpenAltOffers(limit = 30) {
  return prisma.buyerAltOffer.findMany({
    where: { status: "open" },
    orderBy: [{ priceDeltaPct: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      product: { select: { id: true, name: true, slug: true, supplierName: true } },
    },
  });
}

export async function decideAltOffer(input: {
  id: string;
  decision: "accepted" | "dismissed";
  actorEmail?: string | null;
}) {
  const row = await prisma.buyerAltOffer.update({
    where: { id: input.id },
    data: { status: input.decision },
  });

  try {
    const { recordAiFeedback } = await import("@/lib/trust/feedback");
    await recordAiFeedback({
      storeId: row.storeId,
      engine: "digital_buyer",
      kind: input.decision === "accepted" ? "approve" : "dismiss",
      subjectType: "buyer_alt_offer",
      subjectKey: row.id,
      aiProposal: {
        supplier: row.supplier,
        altPrice: row.altPrice,
        currentPrice: row.currentPrice,
      },
      confidence: row.confidence,
      why: Array.isArray(row.why) ? (row.why as string[]) : undefined,
      actorEmail: input.actorEmail,
    });
  } catch {
    /* trust layer optional */
  }

  return row;
}
