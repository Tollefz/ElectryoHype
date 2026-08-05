import { prisma } from "@/lib/prisma";

/** Rough Stripe EU card fee estimate (NOK). Labeled as estimate in UI. */
export function estimateStripeFee(orderTotalNok: number): number {
  if (!Number.isFinite(orderTotalNok) || orderTotalNok <= 0) return 0;
  return Math.round((orderTotalNok * 0.029 + 2) * 100) / 100;
}

export type TodayPnl = {
  paidOrders: number;
  revenue: number;
  shippingCollected: number;
  vatIncluded: number;
  supplierCost: number;
  stripeFeesEst: number;
  grossAfterSupplier: number;
  netEst: number;
};

/**
 * Today's paid-order economics so Rob never opens a spreadsheet.
 */
export async function getTodayPnl(storeId: string): Promise<TodayPnl> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: {
      storeId,
      paymentStatus: "paid",
      createdAt: { gte: start },
      archivedAt: null,
    },
    include: {
      orderItems: {
        include: {
          product: { select: { supplierPrice: true, price: true } },
        },
      },
    },
  });

  let revenue = 0;
  let shippingCollected = 0;
  let vatIncluded = 0;
  let supplierCost = 0;
  let stripeFeesEst = 0;

  for (const order of orders) {
    revenue += Number(order.total) || 0;
    shippingCollected += Number(order.shippingCost) || 0;
    vatIncluded += Number(order.tax) || 0;
    stripeFeesEst += estimateStripeFee(Number(order.total) || 0);

    if (order.orderItems.length > 0) {
      for (const item of order.orderItems) {
        const unitCost =
          item.product.supplierPrice != null && item.product.supplierPrice > 0
            ? Number(item.product.supplierPrice)
            : Number(item.price) * 0.5; // fallback if cost missing
        supplierCost += unitCost * item.quantity;
      }
    } else {
      // JSON items fallback — assume 50% cost if no relations
      try {
        const raw = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
        if (Array.isArray(raw)) {
          for (const item of raw) {
            const qty = Number(item.quantity) || 1;
            const price = Number(item.price) || 0;
            supplierCost += price * 0.5 * qty;
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  const grossAfterSupplier = revenue - supplierCost;
  const netEst = revenue - supplierCost - stripeFeesEst;

  return {
    paidOrders: orders.length,
    revenue: round2(revenue),
    shippingCollected: round2(shippingCollected),
    vatIncluded: round2(vatIncluded),
    supplierCost: round2(supplierCost),
    stripeFeesEst: round2(stripeFeesEst),
    grossAfterSupplier: round2(grossAfterSupplier),
    netEst: round2(netEst),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type DeskQueue = {
  paidNew: number;
  unpaid: number;
  failedPay: number;
  failedEmail: number;
  refundedToday: number;
  noSeo: number;
  missingImages: number;
  needsReview: number;
  importQueued: number;
  importFailed: number;
  importReview: number;
  supplierOutOfStock: number;
  /** Order Automation: address / stock / CJ / retry / manual review. */
  ordersNeedAttention: number;
};

export async function getDeskQueues(storeId: string): Promise<DeskQueue> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const { getCachedPipelineCounts } = await import("@/lib/ops/admin-snapshot");

  const [
    paidNew,
    unpaid,
    failedPay,
    failedEmail,
    refundedToday,
    noSeo,
    missingImages,
    needsReview,
    pipeline,
    supplierOutOfStock,
    ordersNeedAttention,
  ] = await Promise.all([
    prisma.order.count({
      where: { storeId, paymentStatus: "paid", fulfillmentStatus: "NEW", archivedAt: null },
    }),
    prisma.order.count({
      where: { storeId, paymentStatus: "pending", fulfillmentStatus: "NEW", archivedAt: null },
    }),
    prisma.order.count({ where: { storeId, paymentStatus: "failed", archivedAt: null } }),
    prisma.order.count({ where: { storeId, customerEmailStatus: "FAILED", archivedAt: null } }),
    prisma.order.count({
      where: { storeId, paymentStatus: "refunded", updatedAt: { gte: start }, archivedAt: null },
    }),
    prisma.product.count({
      where: {
        storeId,
        OR: [{ metaTitle: null }, { metaTitle: "" }, { metaDescription: null }, { metaDescription: "" }],
      },
    }),
    prisma.product.count({
      where: {
        storeId,
        OR: [{ images: "[]" }, { images: "" }],
      },
    }),
    prisma.product.count({
      where: {
        storeId,
        OR: [
          { category: null },
          { category: "" },
          { metaTitle: null },
          { metaTitle: "" },
          { name: { contains: "Temu Produkt", mode: "insensitive" } },
          // Inactive supplier drafts awaiting review/publish
          { isActive: false, supplierName: { not: null }, autoImport: true },
        ],
      },
    }),
    getCachedPipelineCounts(),
    prisma.product.count({
      where: {
        storeId,
        OR: [{ supplierStatus: "out_of_stock" }, { supplierStatus: "unavailable" }],
      },
    }),
    prisma.order.count({
      where: {
        storeId,
        archivedAt: null,
        automationPhase: {
          in: [
            "ADDRESS_ERROR",
            "WAITING_FOR_STOCK",
            "CJ_ERROR",
            "WAITING_FOR_RETRY",
            "MANUAL_REVIEW",
            "PAYMENT_FAILED",
          ],
        },
      },
    }),
  ]);

  return {
    paidNew,
    unpaid,
    failedPay,
    failedEmail,
    refundedToday,
    noSeo,
    missingImages,
    needsReview,
    importQueued: pipeline.queued,
    importFailed: pipeline.failed,
    importReview: pipeline.awaitingAdmin,
    supplierOutOfStock,
    ordersNeedAttention,
  };
}
