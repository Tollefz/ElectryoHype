/**
 * Catalog versioning — never overwrite tracked fields without a trail.
 */

import "server-only";

import { CatalogVersionKind, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type VersionSource = "import" | "sync" | "manual" | "ai" | "policy";

async function nextVersion(productId: string): Promise<number> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { catalogVersion: true },
  });
  const next = (product?.catalogVersion ?? 0) + 1;
  await prisma.product.update({
    where: { id: productId },
    data: { catalogVersion: next },
  });
  return next;
}

export async function recordCatalogVersions(opts: {
  productId: string;
  source: VersionSource;
  createdBy?: string | null;
  entries: Array<{
    kind: CatalogVersionKind;
    payload: unknown;
    summary?: string;
  }>;
}): Promise<number> {
  if (opts.entries.length === 0) return 0;
  const version = await nextVersion(opts.productId);
  await prisma.productCatalogVersion.createMany({
    data: opts.entries.map((e) => ({
      productId: opts.productId,
      version,
      kind: e.kind,
      payload: e.payload as Prisma.InputJsonValue,
      source: opts.source,
      summary: e.summary,
      createdBy: opts.createdBy || null,
    })),
    skipDuplicates: true,
  });
  return version;
}

export async function listProductCatalogHistory(
  productId: string,
  opts?: { kind?: CatalogVersionKind; take?: number }
) {
  return prisma.productCatalogVersion.findMany({
    where: {
      productId,
      ...(opts?.kind ? { kind: opts.kind } : {}),
    },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    take: opts?.take ?? 100,
  });
}

export function snapshotFieldsForVersioning(product: {
  price: number;
  supplierPrice: number | null;
  stock: number;
  images: string;
  supplierSpecs: unknown;
  attributes: unknown;
  videos: unknown;
  supplierSnapshot: unknown;
}) {
  return [
    {
      kind: CatalogVersionKind.price,
      payload: { retail: product.price, supplier: product.supplierPrice },
      summary: `retail=${product.price} supplier=${product.supplierPrice ?? "—"}`,
    },
    {
      kind: CatalogVersionKind.stock,
      payload: { stock: product.stock },
      summary: `stock=${product.stock}`,
    },
    {
      kind: CatalogVersionKind.images,
      payload: safeJsonParse(product.images),
      summary: "images",
    },
    {
      kind: CatalogVersionKind.specs,
      payload: product.supplierSpecs ?? {},
      summary: "supplierSpecs",
    },
    {
      kind: CatalogVersionKind.attributes,
      payload: product.attributes ?? {},
      summary: "attributes",
    },
    {
      kind: CatalogVersionKind.videos,
      payload: product.videos ?? [],
      summary: "videos",
    },
    {
      kind: CatalogVersionKind.snapshot,
      payload: product.supplierSnapshot ?? {},
      summary: "supplierSnapshot",
    },
  ] as const;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
