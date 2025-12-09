import { OrderStatus, PaymentStatus } from "@prisma/client";
import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import {
  syncProductPrices,
  syncProductAvailability,
} from "@/lib/automation/product-importer";
import { processOrderAutomation } from "@/lib/automation/order-processor";
import { updateOrderTracking } from "@/lib/automation/tracking-updater";

export const syncProducts = inngest.createFunction(
  { id: "sync-products", name: "Sync Products Nightly" },
  { cron: "0 2 * * *" },
  async ({ step }) => {
    await step.run("sync-prices", () => syncProductPrices());
    await step.run("sync-availability", () => syncProductAvailability());
  }
);

export const processOrder = inngest.createFunction(
  { id: "process-order", name: "Process Paid Order" },
  { event: "order/paid" },
  async ({ event, step }) => {
    await step.run("process-order", () => processOrderAutomation(event.data.orderId));
  }
);

export const retryOrder = inngest.createFunction(
  { id: "retry-order", name: "Retry Order Placement" },
  { event: "order/retry" },
  async ({ event, step }) => {
    await step.run("retry-order", () =>
      processOrderAutomation(event.data.orderId, { isRetry: true })
    );
  }
);

export const retryFailedOrders = inngest.createFunction(
  { id: "retry-failed-orders", name: "Retry Failed Orders Job" },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const failedOrders = await step.run("fetch-failed-orders", () =>
      prisma.order.findMany({
        where: {
          status: OrderStatus.processing,
          paymentStatus: PaymentStatus.paid,
          supplierOrderId: null,
          autoOrderAttempts: { lt: 3 },
        },
        select: { id: true },
      })
    );

    for (const order of failedOrders) {
      await step.sendEvent("queue-retry", {
        name: "order/retry",
        data: { orderId: order.id },
      });
    }
  }
);

export const syncTracking = inngest.createFunction(
  { id: "sync-tracking", name: "Sync Tracking" },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    const activeOrders = await step.run("fetch-active-orders", () =>
      prisma.order.findMany({
        where: {
          supplierOrderId: { not: null },
          status: { in: [OrderStatus.processing, OrderStatus.shipped] },
        },
        select: { id: true },
      })
    );

    for (const order of activeOrders) {
      await step.sendEvent("queue-tracking", {
        name: "order/update-tracking",
        data: { orderId: order.id },
      });
    }
  }
);

export const updateTracking = inngest.createFunction(
  { id: "update-order-tracking", name: "Update Order Tracking" },
  { event: "order/update-tracking" },
  async ({ event, step }) => {
    await step.run("update-tracking", () => updateOrderTracking(event.data.orderId));
  }
);

export const inngestFunctions = [
  syncProducts,
  processOrder,
  retryOrder,
  retryFailedOrders,
  syncTracking,
  updateTracking,
];

