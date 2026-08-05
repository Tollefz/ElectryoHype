/**
 * Health aggregation for Supplier Engine dashboard (enterprise observability).
 */

import "server-only";

import { SupplierName } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getCatalogProvider,
  listCatalogSuppliers,
} from "@/lib/suppliers/registry";
import type { CatalogSupplierId } from "@/lib/suppliers/provider";
import { getWorkerObservability } from "@/lib/suppliers/workers/jobs";
import { listEnabledSupplierAccounts } from "@/lib/suppliers/accounts";
import { createTtlCache } from "@/lib/ops/ttl-cache";

const healthResultCache = createTtlCache<
  Awaited<ReturnType<typeof buildSupplierEngineHealth>>
>({ ttlOkMs: 20_000, ttlFailMs: 10_000 });

export type SupplierHealthRow = {
  id: CatalogSupplierId;
  displayName: string;
  status: string;
  configured: boolean;
  apiOk: boolean | null;
  accounts: number;
  productsCount: number;
  publishedCount: number;
  inStockCount: number;
  queueQueued: number;
  queueReview: number;
  queueFailed: number;
  queuePreview: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  openChanges: number;
  recentApiErrors: number;
  avgApiLatencyMs: number | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

export async function getSupplierEngineHealth(): Promise<{
  suppliers: SupplierHealthRow[];
  totals: {
    products: number;
    published: number;
    inStock: number;
    queued: number;
    review: number;
    failed: number;
    openChanges: number;
    importsLast24h: number;
    autoApprovedLast24h: number;
  };
  workers: Awaited<ReturnType<typeof getWorkerObservability>>;
  observability: {
    syncRatePerHour: number;
    errorRate24h: number | null;
    avgApiLatencyMs: number | null;
    avgImportMs: number | null;
    avgAiMs: number | null;
  };
}> {
  return healthResultCache.getOrSet("supplier-engine-health", () =>
    buildSupplierEngineHealth()
  );
}

async function buildSupplierEngineHealth(): Promise<{
  suppliers: SupplierHealthRow[];
  totals: {
    products: number;
    published: number;
    inStock: number;
    queued: number;
    review: number;
    failed: number;
    openChanges: number;
    importsLast24h: number;
    autoApprovedLast24h: number;
  };
  workers: Awaited<ReturnType<typeof getWorkerObservability>>;
  observability: {
    syncRatePerHour: number;
    errorRate24h: number | null;
    avgApiLatencyMs: number | null;
    avgImportMs: number | null;
    avgAiMs: number | null;
  };
}> {
  const metas = listCatalogSuppliers({ includeComing: true, includeLegacy: false });
  const rows: SupplierHealthRow[] = [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const accounts = await listEnabledSupplierAccounts().catch(() => []);

  for (const meta of metas) {
    if (meta.status !== "active") {
      rows.push({
        id: meta.id,
        displayName: meta.displayName,
        status: meta.status,
        configured: false,
        apiOk: null,
        accounts: 0,
        productsCount: 0,
        publishedCount: 0,
        inStockCount: 0,
        queueQueued: 0,
        queueReview: 0,
        queueFailed: 0,
        queuePreview: 0,
        lastSyncAt: null,
        lastSyncStatus: null,
        openChanges: 0,
        recentApiErrors: 0,
        avgApiLatencyMs: null,
        lastError: null,
        lastErrorAt: null,
      });
      continue;
    }

    const supplierName = meta.id as SupplierName;
    let configured = false;
    let apiOk: boolean | null = null;
    try {
      const provider = getCatalogProvider(meta.id);
      configured = await provider.isConfigured();
      apiOk = configured;
    } catch {
      configured = false;
      apiOk = false;
    }

    const accountCount = accounts.filter((a) => a.supplierType === supplierName).length;

    // Product counts filled after loop via one groupBy (not 3×count per supplier)
    const [
      queueQueued,
      queueReview,
      queueFailed,
      queuePreview,
      lastSync,
      openChanges,
      recentApiErrors,
      latencyAgg,
      lastFailLog,
    ] = await Promise.all([
      prisma.importQueueItem.count({ where: { supplier: supplierName, status: "queued" } }),
      prisma.importQueueItem.count({
        where: { supplier: supplierName, status: { in: ["review", "approved"] } },
      }),
      prisma.importQueueItem.count({ where: { supplier: supplierName, status: "failed" } }),
      prisma.importQueueItem.count({
        where: { supplier: supplierName, pipelineStage: "preview" },
      }),
      prisma.supplierSyncRun.findFirst({
        where: { supplier: supplierName },
        orderBy: { startedAt: "desc" },
      }),
      prisma.supplierChangeEvent.count({
        where: { supplier: supplierName, applied: false, dismissed: false },
      }),
      prisma.supplierApiLog.count({
        where: { supplier: meta.id, ok: false, createdAt: { gte: since } },
      }),
      prisma.supplierApiLog.aggregate({
        where: { supplier: meta.id, durationMs: { not: null }, createdAt: { gte: since } },
        _avg: { durationMs: true },
      }),
      prisma.supplierApiLog.findFirst({
        where: { supplier: meta.id, ok: false },
        orderBy: { createdAt: "desc" },
        select: { error: true, createdAt: true, path: true },
      }),
    ]);

    rows.push({
      id: meta.id,
      displayName: meta.displayName,
      status: meta.status,
      configured,
      apiOk,
      accounts: accountCount,
      productsCount: 0,
      publishedCount: 0,
      inStockCount: 0,
      queueQueued,
      queueReview,
      queueFailed,
      queuePreview,
      lastSyncAt: (lastSync?.finishedAt || lastSync?.startedAt)?.toISOString() || null,
      lastSyncStatus: lastSync?.status || null,
      openChanges,
      recentApiErrors,
      avgApiLatencyMs: latencyAgg._avg.durationMs
        ? Math.round(latencyAgg._avg.durationMs)
        : null,
      lastError:
        lastFailLog?.error ||
        (lastFailLog?.path ? `API ${lastFailLog.path}` : null) ||
        (lastSync?.status === "failed"
          ? typeof lastSync.errors === "string"
            ? lastSync.errors
            : "Siste sync feilet"
          : null),
      lastErrorAt: lastFailLog?.createdAt?.toISOString() || null,
    });
  }

  // One groupBy for product totals per supplier (+ separate in-stock counts)
  const productGroups = await prisma.product.groupBy({
    by: ["supplierName", "isActive"],
    _count: { _all: true },
  });
  const productBySupplier = new Map<string, { total: number; active: number }>();
  for (const g of productGroups) {
    const key = g.supplierName || "";
    const cur = productBySupplier.get(key) || { total: 0, active: 0 };
    cur.total += g._count._all;
    if (g.isActive) cur.active += g._count._all;
    productBySupplier.set(key, cur);
  }
  const inStockBySupplier = await prisma.product.groupBy({
    by: ["supplierName"],
    where: {
      isActive: true,
      OR: [
        { supplierStatus: "available" },
        { supplierStatus: "unknown", stock: { gt: 0 } },
        { supplierInventory: { gt: 0 } },
      ],
    },
    _count: { _all: true },
  });
  const inStockMap = new Map(
    inStockBySupplier.map((r) => [r.supplierName || "", r._count._all])
  );
  for (const row of rows) {
    const p = productBySupplier.get(row.id) || { total: 0, active: 0 };
    row.productsCount = p.total;
    row.publishedCount = p.active;
    row.inStockCount = inStockMap.get(row.id) || 0;
  }

  const workers = await getWorkerObservability().catch(() => ({
    byStatus: {} as { [k: string]: number },
    activeWorkers: 0,
    deadLast24h: 0,
    succeededLast24h: 0,
    avgImportMs: null as number | null,
    queueLength: 0,
    recentJobs: [] as Awaited<ReturnType<typeof getWorkerObservability>>["recentJobs"],
    buyer: null as Awaited<ReturnType<typeof getWorkerObservability>>["buyer"],
  }));

  const [importsLast24h, autoApprovedLast24h, syncRuns24h, apiTotal24h, apiFail24h, globalLatency, pipeline] =
    await Promise.all([
      prisma.importQueueItem.count({
        where: {
          processedAt: { gte: since },
          status: { in: ["review", "approved", "published"] },
        },
      }),
      prisma.importQueueItem.count({
        where: { autoApproved: true, processedAt: { gte: since } },
      }),
      prisma.supplierSyncRun.count({ where: { startedAt: { gte: since } } }),
      prisma.supplierApiLog.count({ where: { createdAt: { gte: since } } }),
      prisma.supplierApiLog.count({ where: { createdAt: { gte: since }, ok: false } }),
      prisma.supplierApiLog.aggregate({
        where: { durationMs: { not: null }, createdAt: { gte: since } },
        _avg: { durationMs: true },
      }),
      import("@/lib/ops/admin-snapshot").then((m) => m.getCachedPipelineCounts()),
    ]);

  // AI timing: approximate from enrichment JSON is not stored as duration; use null until instrumented
  const avgAiMs = null;

  return {
    suppliers: rows,
    totals: {
      products: rows.reduce((s, r) => s + r.productsCount, 0),
      published: rows.reduce((s, r) => s + r.publishedCount, 0),
      inStock: rows.reduce((s, r) => s + r.inStockCount, 0),
      queued: pipeline.queued,
      review: pipeline.awaitingAdmin,
      failed: pipeline.failed,
      openChanges: rows.reduce((s, r) => s + r.openChanges, 0),
      importsLast24h,
      autoApprovedLast24h,
    },
    workers,
    observability: {
      syncRatePerHour: Math.round((syncRuns24h / 24) * 10) / 10,
      errorRate24h: apiTotal24h
        ? Math.round((apiFail24h / apiTotal24h) * 1000) / 10
        : null,
      avgApiLatencyMs: globalLatency._avg.durationMs
        ? Math.round(globalLatency._avg.durationMs)
        : null,
      avgImportMs: workers.avgImportMs,
      avgAiMs,
    },
  };
}
