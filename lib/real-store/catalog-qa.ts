/**
 * Catalog quality validators — only issues that need action.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { CatalogQaIssue } from "@/lib/real-store/types";

export async function runCatalogQualityChecks(
  storeId?: string | null
): Promise<CatalogQaIssue[]> {
  const where = {
    isActive: true,
    ...(storeId ? { storeId } : {}),
  };

  const [
    noCategory,
    noPrice,
    noSeo,
    noImages,
    noSupplier,
    noMargin,
    totalActive,
  ] = await Promise.all([
    prisma.product.count({
      where: {
        ...where,
        OR: [{ category: null }, { category: "" }, { category: "Ukategorisert" }],
      },
    }),
    prisma.product.count({
      where: { ...where, OR: [{ price: { lte: 0 } }] },
    }),
    prisma.product.count({
      where: {
        ...where,
        OR: [
          { metaTitle: null },
          { metaTitle: "" },
          { metaDescription: null },
          { metaDescription: "" },
        ],
      },
    }),
    prisma.product.count({
      where: {
        ...where,
        OR: [{ images: "[]" }, { images: "" }, { images: "null" }],
      },
    }),
    prisma.product.count({
      where: {
        ...where,
        OR: [{ supplierProductId: null }, { supplierName: null }],
      },
    }),
    prisma.product.count({
      where: {
        ...where,
        supplierPrice: { not: null, gt: 0 },
        // margin check done in memory below for accuracy — count candidates first
      },
    }),
    prisma.product.count({ where }),
  ]);

  // Low/negative margin among products with supplier price
  const withCost = await prisma.product.findMany({
    where: { ...where, supplierPrice: { gt: 0 }, price: { gt: 0 } },
    select: { id: true, price: true, supplierPrice: true },
    take: 800,
  });
  const lowMargin = withCost.filter((p) => {
    const m = ((p.price - (p.supplierPrice || 0)) / p.price) * 100;
    return m < 15;
  }).length;

  const issues: CatalogQaIssue[] = [];
  const push = (
    id: string,
    label: string,
    count: number,
    href: string,
    severity: CatalogQaIssue["severity"]
  ) => {
    if (count > 0) issues.push({ id, label, count, href, severity });
  };

  push(
    "no_category",
    "Aktive produkter uten kategori",
    noCategory,
    "/admin/products?filter=no-category",
    "high"
  );
  push(
    "no_price",
    "Aktive produkter uten gyldig pris",
    noPrice,
    "/admin/products",
    "high"
  );
  push(
    "no_seo",
    "Aktive produkter uten SEO",
    noSeo,
    "/admin/dashboard",
    "medium"
  );
  push(
    "no_images",
    "Aktive produkter uten bilder",
    noImages,
    "/admin/dashboard",
    "high"
  );
  push(
    "no_supplier",
    "Aktive produkter uten leverandørkobling",
    noSupplier,
    "/admin/suppliers",
    "medium"
  );
  push(
    "low_margin",
    "Aktive produkter med margin under 15 %",
    lowMargin,
    "/admin/products/pricing-audit",
    "medium"
  );

  // Broken links: supplier URL empty but has supplier id — soft
  const brokenUrl = await prisma.product.count({
    where: {
      ...where,
      supplierProductId: { not: null },
      OR: [{ supplierUrl: null }, { supplierUrl: "" }],
    },
  });
  push(
    "broken_supplier_url",
    "Mangler leverandør-URL",
    brokenUrl,
    "/admin/suppliers",
    "low"
  );

  void totalActive;
  void noMargin;

  return issues;
}
