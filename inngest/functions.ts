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

export const syncCatalogSuppliers = inngest.createFunction(
  { id: "sync-catalog-suppliers", name: "Sync Catalog Suppliers" },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    await step.run("catalog-inventory-price", async () => {
      const { getConfiguredCatalogProviders } = await import("@/lib/suppliers/registry");
      const { runCatalogSync } = await import("@/lib/suppliers/sync/engine");

      const providers = await getConfiguredCatalogProviders();
      if (providers.length === 0) {
        return { skipped: true, reason: "No catalog suppliers configured" };
      }

      const outcomes = [];
      for (const provider of providers) {
        outcomes.push({
          supplier: provider.id,
          ...(await runCatalogSync({ provider, applySafeUpdates: true })),
        });
      }
      return { outcomes };
    });

    await step.run("process-import-queue", async () => {
      const { runSupplierWorkers } = await import("@/lib/suppliers/workers/jobs");
      return runSupplierWorkers({ concurrency: 4, limit: 20, types: ["import_item"] });
    });

    await step.run("drain-buyer-scan", async () => {
      const { tickBuyerHuntWorker } = await import("@/lib/buyer/buyer-worker");
      return tickBuyerHuntWorker({ limit: 8 });
    });

    await step.run("autonomy-light-after-sync", async () => {
      const { getOrCreateAutonomyPolicy, runAutonomyCycle } = await import(
        "@/lib/autonomy"
      );
      const policy = await getOrCreateAutonomyPolicy();
      if (!policy.scheduleEnabled) {
        return { skipped: true, reason: "schedule disabled" };
      }
      return runAutonomyCycle({
        trigger: "supplier_sync",
        light: true,
      });
    });
  }
);

/**
 * Primary serverless drain for buyer_scan_batch — every minute.
 * Dedicated process (`npm run worker:buyer-hunt`) is preferred when available;
 * this cron keeps the queue moving without admin UI traffic.
 */
export const buyerHuntWorkerTick = inngest.createFunction(
  { id: "buyer-hunt-worker-tick", name: "Buyer Hunt Worker Tick" },
  { cron: "* * * * *" },
  async ({ step }) => {
    return step.run("drain-buyer-scan-batch", async () => {
      const { tickBuyerHuntWorker } = await import("@/lib/buyer/buyer-worker");
      return tickBuyerHuntWorker();
    });
  }
);

/**
 * Order Automation Worker tick — every minute.
 * Prefer `npm run worker:order` when a dedicated process is available.
 */
export const orderAutomationWorkerTick = inngest.createFunction(
  { id: "order-automation-worker-tick", name: "Order Automation Worker Tick" },
  { cron: "* * * * *" },
  async ({ step }) => {
    return step.run("drain-order-automation", async () => {
      const { tickOrderWorker } = await import("@/lib/orders/order-worker");
      return tickOrderWorker();
    });
  }
);

/**
 * Marketing Brain Worker tick — every 5 minutes.
 * Prefer `npm run worker:marketing` when a dedicated process is available.
 * Analyse / score / memory only — never publishes ads.
 */
export const marketingBrainWorkerTick = inngest.createFunction(
  { id: "marketing-brain-worker-tick", name: "Marketing Brain Worker Tick" },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    return step.run("advance-marketing-brain", async () => {
      const { tickMarketingWorker } = await import(
        "@/lib/marketing/marketing-worker"
      );
      return tickMarketingWorker();
    });
  }
);

/** Continuous Digital Buyer — seeks products without admin search. */
export const digitalBuyerHourly = inngest.createFunction(
  { id: "digital-buyer-hourly", name: "Digital Buyer Continuous Scan" },
  { cron: "30 * * * *" },
  async ({ step }) => {
    return step.run("buyer-scan-and-alts", async () => {
      const { startBuyerScan } = await import("@/lib/buyer/scan");
      const { findAlternativeSuppliers } = await import("@/lib/buyer/alternatives");
      const { refreshProductLifecycles } = await import("@/lib/buyer/lifecycle");
      const { tickBuyerHuntWorker } = await import("@/lib/buyer/buyer-worker");
      const { prisma } = await import("@/lib/prisma");

      const active = await prisma.buyerScanRun.findFirst({
        where: { status: { in: ["running", "paused"] } },
        orderBy: { createdAt: "desc" },
      });

      const pendingBatches = await prisma.supplierJob.count({
        where: {
          type: "buyer_scan_batch",
          status: { in: ["pending", "failed", "locked", "running"] },
        },
      });

      let scan = null;
      // Only start background Quick when fully idle — never starve a user mission
      if (!active && pendingBatches === 0) {
        scan = await startBuyerScan({
          targetScanCount: 500,
          missionSize: "quick",
          processInline: false,
        });
      }

      const preferId =
        active?.status === "running"
          ? active.id
          : scan?.id || null;

      const drained = await tickBuyerHuntWorker({
        preferScanRunId: preferId,
        limit: active && (active.targetScanCount || 0) >= 10_000 ? 30 : 16,
      });

      const alts = await findAlternativeSuppliers({ limitProducts: 10 });
      const lifecycle = await refreshProductLifecycles();

      return {
        scanId: scan?.id || active?.id,
        activeStatus: active?.status || null,
        pendingBatches,
        drained,
        alts,
        lifecycle,
      };
    });
  }
);

/** Nightly full Autonomous Commerce cycle — after price sync (02:00). */
export const autonomyNightly = inngest.createFunction(
  { id: "autonomy-nightly", name: "Autonomous Commerce Nightly" },
  { cron: "0 3 * * *" },
  async ({ step }) => {
    const autonomy = await step.run("autonomy-full-cycle", async () => {
      const { getOrCreateAutonomyPolicy, runAutonomyCycle } = await import(
        "@/lib/autonomy"
      );
      const policy = await getOrCreateAutonomyPolicy();
      if (!policy.scheduleEnabled) {
        return { skipped: true, reason: "schedule disabled" };
      }
      return runAutonomyCycle({
        trigger: "cron_nightly",
        light: false,
      });
    });

    const nightMission = await step.run("night-deep-scan", async () => {
      const { ensureNightDeepScan } = await import("@/lib/buyer/scan");
      const { tickBuyerHuntWorker } = await import("@/lib/buyer/buyer-worker");
      const night = await ensureNightDeepScan();
      await tickBuyerHuntWorker({ limit: 30 }).catch(() => undefined);
      return night;
    });

    return { autonomy, nightMission };
  }
);

/** Hourly light cycle — tasks + health signals. */
export const autonomyHourly = inngest.createFunction(
  { id: "autonomy-hourly", name: "Autonomous Commerce Hourly" },
  { cron: "15 * * * *" },
  async ({ step }) => {
    return step.run("autonomy-light-cycle", async () => {
      const { getOrCreateAutonomyPolicy, runAutonomyCycle } = await import(
        "@/lib/autonomy"
      );
      const policy = await getOrCreateAutonomyPolicy();
      if (!policy.scheduleEnabled) {
        return { skipped: true, reason: "schedule disabled" };
      }
      return runAutonomyCycle({
        trigger: "cron_hourly",
        light: true,
      });
    });
  }
);

/** Nightly Self-Improving Store — after autonomy (04:00). */
export const selfImproveNightly = inngest.createFunction(
  { id: "self-improve-nightly", name: "Self-Improving Store Nightly" },
  { cron: "0 4 * * *" },
  async ({ step }) => {
    return step.run("discover-improvements", async () => {
      const { runNightlySelfImprove } = await import("@/lib/improve");
      return runNightlySelfImprove();
    });
  }
);

/** Weekly AI self-evaluation — Sunday 04:30. */
export const aiTrustWeekly = inngest.createFunction(
  { id: "ai-trust-weekly", name: "AI Trust Weekly Self-Eval" },
  { cron: "30 4 * * 0" },
  async ({ step }) => {
    return step.run("self-eval", async () => {
      const { runAiSelfEvaluation } = await import("@/lib/trust");
      return runAiSelfEvaluation({ days: 7 });
    });
  }
);

export const inngestFunctions = [
  syncProducts,
  syncCatalogSuppliers,
  buyerHuntWorkerTick,
  orderAutomationWorkerTick,
  marketingBrainWorkerTick,
  digitalBuyerHourly,
  autonomyNightly,
  autonomyHourly,
  selfImproveNightly,
  aiTrustWeekly,
  processOrder,
  retryOrder,
  retryFailedOrders,
  syncTracking,
  updateTracking,
];
