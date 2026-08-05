/**
 * Product lifecycle monitoring for Digital Buyer.
 */

import "server-only";

import { prisma } from "@/lib/prisma";

export type LifecycleCounts = Record<
  "new_active" | "active" | "declining" | "discontinued" | "replace_candidate",
  number
>;

export async function refreshProductLifecycles(storeId?: string | null) {
  const whereStore = storeId ? { storeId } : {};

  // Discontinued / unavailable from supplier
  await prisma.product.updateMany({
    where: {
      ...whereStore,
      supplierStatus: { in: ["unavailable", "out_of_stock"] },
    },
    data: { buyerLifecycle: "discontinued" },
  });

  // New: created last 14 days, active
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  await prisma.product.updateMany({
    where: {
      ...whereStore,
      isActive: true,
      createdAt: { gte: since },
      supplierStatus: { notIn: ["unavailable", "out_of_stock"] },
      buyerLifecycle: { not: "replace_candidate" },
    },
    data: { buyerLifecycle: "new_active" },
  });

  // Declining: open price or stock change events
  const decliningIds = await prisma.supplierChangeEvent.findMany({
    where: {
      applied: false,
      dismissed: false,
      changeType: { in: ["price", "stock", "unavailable"] },
      productId: { not: null },
    },
    select: { productId: true },
    take: 500,
  });
  const ids = [
    ...new Set(decliningIds.map((d) => d.productId).filter(Boolean) as string[]),
  ];
  if (ids.length) {
    await prisma.product.updateMany({
      where: {
        id: { in: ids },
        buyerLifecycle: { notIn: ["discontinued", "replace_candidate"] },
      },
      data: { buyerLifecycle: "declining" },
    });
  }

  // Active: everything else that is live
  await prisma.product.updateMany({
    where: {
      ...whereStore,
      isActive: true,
      supplierStatus: { notIn: ["unavailable", "out_of_stock"] },
      createdAt: { lt: since },
      buyerLifecycle: { notIn: ["declining", "replace_candidate", "discontinued"] },
    },
    data: { buyerLifecycle: "active" },
  });

  return getLifecycleCounts(storeId);
}

export async function getLifecycleCounts(
  storeId?: string | null
): Promise<LifecycleCounts> {
  const whereStore = storeId ? { storeId } : {};
  const groups = await prisma.product.groupBy({
    by: ["buyerLifecycle"],
    where: whereStore,
    _count: { _all: true },
  });

  const base: LifecycleCounts = {
    new_active: 0,
    active: 0,
    declining: 0,
    discontinued: 0,
    replace_candidate: 0,
  };

  for (const g of groups) {
    const key = g.buyerLifecycle as keyof LifecycleCounts;
    if (key in base) base[key] = g._count._all;
  }
  return base;
}
